import type { Socket } from "socket.io";
import { z } from "zod";
import type { Ack, ClientToServerEvents, PresenceUser, ServerToClientEvents, User } from "@velora/shared";
import { getUser, verifyToken } from "../auth/auth";
import * as boards from "../boards/service";
import { AppError, toAppError } from "../lib/errors";
import { rateLimit } from "../lib/rateLimit";
import { boardRoom, type IoServer, type SocketData } from "./io";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Events whose last argument is an ack callback, mapped to the ack payload type. */
type AckEvents = {
  [E in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[E]> extends [unknown, (r: Ack<infer T>) => void]
    ? T
    : never;
};
type AckEventName = {
  [E in keyof AckEvents]: [AckEvents[E]] extends [never] ? never : E;
}[keyof AckEvents];

/** Untyped view of the socket, used only to register the generic ack handlers. */
type LooseSocket = { on(event: string, listener: (...args: any[]) => void): unknown };

const id = z.uuid();
const title = z.string().trim().min(1).max(200);
const index = z.number().int().min(0).max(100_000);

/**
 * Aggregates presence across *all* API instances: with the Redis adapter,
 * fetchSockets() asks every node which sockets are in the room.
 */
async function presence(io: IoServer, boardId: string): Promise<PresenceUser[]> {
  const sockets = await io.in(boardRoom(boardId)).fetchSockets();
  const byUser = new Map<string, PresenceUser>();
  for (const s of sockets) {
    const { user, focusedCardId } = s.data;
    const existing = byUser.get(user.id);
    if (existing) {
      existing.connections++;
      existing.focusedCardId ??= focusedCardId;
    } else {
      byUser.set(user.id, { id: user.id, name: user.name, color: user.color, focusedCardId, connections: 1 });
    }
  }
  return [...byUser.values()];
}

async function broadcastPresence(io: IoServer, boardId: string): Promise<void> {
  io.to(boardRoom(boardId)).emit("presence:update", await presence(io, boardId));
}

export function registerRealtime(io: IoServer): void {
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown }).token;
      if (typeof token !== "string") throw new AppError("UNAUTHORIZED", "Missing token");
      const user = await getUser(verifyToken(token));
      socket.data = { user, boardId: null, focusedCardId: null };
      next();
    } catch (err) {
      next(new Error(toAppError(err).code));
    }
  });

  io.on("connection", (socket: AppSocket) => {
    const user: User = socket.data.user;
    let lastCursorAt = 0;

    /**
     * Registers a board-scoped handler: validates input with zod, ensures the
     * socket has joined a board, and always answers the ack with a typed result.
     */
    function handle<E extends AckEventName, S extends z.ZodType>(
      event: E,
      schema: S,
      fn: (input: z.infer<S>, boardId: string) => Promise<AckEvents[E]>,
    ): void {
      (socket as unknown as LooseSocket).on(event, async (payload: unknown, ack?: (r: Ack<AckEvents[E]>) => void) => {
        const reply = typeof ack === "function" ? ack : () => {};
        try {
          const boardId = socket.data.boardId;
          if (!boardId) throw new AppError("FORBIDDEN", "Join a board first");
          reply({ ok: true, data: await fn(schema.parse(payload), boardId) });
        } catch (err) {
          const e = toAppError(err);
          reply({ ok: false, error: e.message, code: e.code, current: e.current });
        }
      });
    }

    const room = () => boardRoom(socket.data.boardId!);

    async function leaveCurrentBoard(): Promise<void> {
      const boardId = socket.data.boardId;
      if (!boardId) return;
      socket.to(boardRoom(boardId)).emit("cursor:leave", { userId: user.id });
      socket.to(boardRoom(boardId)).emit("chat:typing", { userId: user.id, name: user.name, typing: false });
      await socket.leave(boardRoom(boardId));
      socket.data.boardId = null;
      socket.data.focusedCardId = null;
      await broadcastPresence(io, boardId);
    }

    // --- Board session -----------------------------------------------------

    socket.on("board:join", async (payload, ack) => {
      try {
        const { boardId } = z.object({ boardId: id }).parse(payload);
        await boards.getRole(boardId, user.id);
        if (socket.data.boardId !== boardId) await leaveCurrentBoard();
        // Join the room *before* reading the snapshot: any write committed after the
        // read is guaranteed to reach this socket. The client buffers those events
        // until the ack arrives and replays them on top of the snapshot.
        await socket.join(boardRoom(boardId));
        socket.data.boardId = boardId;
        const [snapshot, messages] = await Promise.all([boards.getSnapshot(boardId), boards.listMessages(boardId)]);
        const users = await presence(io, boardId);
        socket.to(boardRoom(boardId)).emit("presence:update", users);
        ack({ ok: true, data: { snapshot, messages, presence: users } });
      } catch (err) {
        const e = toAppError(err);
        ack({ ok: false, error: e.message, code: e.code });
      }
    });

    socket.on("board:leave", () => void leaveCurrentBoard());

    socket.on("disconnect", () => {
      const boardId = socket.data.boardId;
      if (!boardId) return;
      io.to(boardRoom(boardId)).emit("cursor:leave", { userId: user.id });
      void broadcastPresence(io, boardId).catch(() => {});
    });

    handle("board:rename", z.object({ title: z.string().trim().min(1).max(100) }), async (p, boardId) => {
      const board = await boards.renameBoard(boardId, p.title);
      io.to(room()).emit("board:updated", board);
      return board;
    });

    // --- Lists -------------------------------------------------------------

    handle("list:create", z.object({ title }), async (p, boardId) => {
      const list = await boards.createList(boardId, p.title);
      io.to(room()).emit("list:upserted", list);
      return list;
    });

    handle("list:update", z.object({ id, title }), async (p, boardId) => {
      const list = await boards.updateList(boardId, p.id, p.title);
      io.to(room()).emit("list:upserted", list);
      return list;
    });

    handle("list:delete", z.object({ id }), async (p, boardId) => {
      await boards.deleteList(boardId, p.id);
      io.to(room()).emit("list:deleted", { id: p.id });
      return { id: p.id };
    });

    handle("list:move", z.object({ id, toIndex: index }), async (p, boardId) => {
      const { list, rebalanced } = await boards.moveList(boardId, p.id, p.toIndex);
      if (rebalanced) io.to(room()).emit("lists:rebalanced", { positions: rebalanced });
      io.to(room()).emit("list:upserted", list);
      return list;
    });

    // --- Cards -------------------------------------------------------------

    handle("card:create", z.object({ listId: id, title }), async (p, boardId) => {
      const card = await boards.createCard(boardId, p.listId, p.title, user.id);
      io.to(room()).emit("card:upserted", card);
      return card;
    });

    handle(
      "card:update",
      z
        .object({
          id,
          version: z.number().int().positive(),
          title: title.optional(),
          description: z.string().max(10_000).optional(),
        })
        .refine((p) => p.title !== undefined || p.description !== undefined, "Nothing to update"),
      async (p, boardId) => {
        const card = await boards.updateCard(boardId, p.id, p.version, p, user.id);
        io.to(room()).emit("card:upserted", card);
        return card;
      },
    );

    handle("card:delete", z.object({ id }), async (p, boardId) => {
      await boards.deleteCard(boardId, p.id);
      io.to(room()).emit("card:deleted", { id: p.id });
      return { id: p.id };
    });

    handle("card:move", z.object({ id, toListId: id, toIndex: index }), async (p, boardId) => {
      const { card, rebalanced } = await boards.moveCard(boardId, p.id, p.toListId, p.toIndex);
      if (rebalanced) io.to(room()).emit("cards:rebalanced", { listId: card.listId, positions: rebalanced });
      io.to(room()).emit("card:upserted", card);
      return card;
    });

    socket.on("card:focus", (payload) => {
      const parsed = z.object({ cardId: id.nullable() }).safeParse(payload);
      const boardId = socket.data.boardId;
      if (!parsed.success || !boardId) return;
      socket.data.focusedCardId = parsed.data.cardId;
      void broadcastPresence(io, boardId).catch(() => {});
    });

    // --- Chat --------------------------------------------------------------

    handle("chat:send", z.object({ content: z.string().trim().min(1).max(2000) }), async (p, boardId) => {
      await rateLimit(`chat:${user.id}`, 10, 10);
      const message = await boards.createMessage(boardId, user, p.content);
      io.to(room()).emit("chat:message", message);
      return message;
    });

    socket.on("chat:typing", (payload) => {
      if (!socket.data.boardId) return;
      const typing = Boolean((payload as { typing?: unknown })?.typing);
      socket.to(room()).emit("chat:typing", { userId: user.id, name: user.name, typing });
    });

    // --- Cursors (high-frequency, lossy) -----------------------------------

    socket.on("cursor:move", (payload) => {
      const now = Date.now();
      if (!socket.data.boardId || now - lastCursorAt < 30) return;
      const { x, y } = (payload ?? {}) as { x?: unknown; y?: unknown };
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
      lastCursorAt = now;
      // volatile: dropped rather than queued if the client is congested.
      socket.volatile.to(room()).emit("cursor:update", { userId: user.id, x, y });
    });
  });
}
