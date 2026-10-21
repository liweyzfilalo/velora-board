import { io, type Socket } from "socket.io-client";
import {
  byPosition,
  positionAtIndex,
  type Ack,
  type Card,
  type ClientToServerEvents,
  type ErrorCode,
  type ServerToClientEvents,
} from "@synkro/shared";
import { API_URL } from "@/lib/api";
import { useBoard } from "@/store/board";
import { toast } from "@/store/toasts";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Failure = Extract<Ack<unknown>, { ok: false }>;

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  NOT_FOUND: "Cet élément n'existe plus (supprimé par un autre membre).",
  FORBIDDEN: "Accès refusé.",
  VALIDATION: "Saisie invalide.",
  RATE_LIMITED: "Doucement ! Trop de requêtes, réessaie dans quelques secondes.",
};

export const errorMessage = (f: Failure) => ERROR_MESSAGES[f.code] ?? "Erreur serveur.";

interface SessionCallbacks {
  onUnauthorized(): void;
  onBoardDeleted(): void;
}

/**
 * One realtime session per open board.
 *
 * - Server events received while (re)joining are buffered and replayed on top
 *   of the snapshot, so nothing committed during the join is lost.
 * - Moves are optimistic. While a move is in flight, incoming events for that
 *   item keep the local placement (content still updates); the ack then
 *   applies the authoritative position.
 * - Any rejected mutation triggers a full resync rather than trying to undo locally.
 */
export class BoardSession {
  private readonly socket: AppSocket;
  private joined = false;
  private buffer: Array<() => void> = [];
  private seq = 0;
  private readonly pendingCardMoves = new Map<string, number>();
  private readonly pendingListMoves = new Map<string, number>();
  private lastCursorSent = 0;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly boardId: string,
    token: string,
    private readonly callbacks: SessionCallbacks,
  ) {
    // WebSocket only: no long-polling fallback means no sticky sessions are
    // needed when running several API instances behind a load balancer.
    this.socket = io(API_URL, { auth: { token }, transports: ["websocket"], autoConnect: false });
  }

  /** Safe to call again after stop() (React StrictMode mounts effects twice). */
  start(): void {
    useBoard.getState().setStatus("connecting");
    this.bindEvents();
    this.socket.connect();
  }

  stop(): void {
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }

  // --- Lifecycle -----------------------------------------------------------

  private bindEvents(): void {
    const store = useBoard.getState;
    const s = this.socket;

    s.on("connect", () => this.join());
    s.on("disconnect", () => {
      this.joined = false;
      store().setStatus("offline");
    });
    s.on("connect_error", (err) => {
      if (err.message === "UNAUTHORIZED") this.callbacks.onUnauthorized();
      else store().setStatus("offline");
    });

    this.on("board:updated", (b) => store().setBoard(b));
    this.on("board:deleted", () => this.callbacks.onBoardDeleted());
    this.on("member:joined", (u) => {
      store().addMember(u);
      toast(`${u.name} a rejoint le tableau`);
    });

    this.on("list:upserted", (l) => store().upsertList(l, { keepPlacement: this.pendingListMoves.has(l.id) }));
    this.on("list:deleted", ({ id }) => store().removeList(id));
    this.on("lists:rebalanced", ({ positions }) => store().setListPositions(positions));

    this.on("card:upserted", (c) => store().upsertCard(c, { keepPlacement: this.pendingCardMoves.has(c.id) }));
    this.on("card:deleted", ({ id }) => store().removeCard(id));
    this.on("cards:rebalanced", ({ positions }) => store().setCardPositions(positions));

    this.on("chat:message", (m) => store().addMessage(m));
    this.on("chat:typing", ({ userId, name, typing }) => store().setTyping(userId, name, typing));
    this.on("presence:update", (users) => store().setPresence(users));

    // Cursors are ephemeral: never buffered.
    s.on("cursor:update", ({ userId, x, y }) => store().setCursor(userId, x, y));
    s.on("cursor:leave", ({ userId }) => store().removeCursor(userId));
  }

  private on<E extends keyof ServerToClientEvents>(event: E, apply: ServerToClientEvents[E]): void {
    const handler = (...args: unknown[]) => {
      const run = () => (apply as (...a: unknown[]) => void)(...args);
      if (this.joined) run();
      else this.buffer.push(run);
    };
    (this.socket as unknown as { on(event: string, fn: (...args: unknown[]) => void): void }).on(event, handler);
  }

  private join(): void {
    this.joined = false;
    this.buffer = [];
    useBoard.getState().setStatus("syncing");
    this.socket.emit("board:join", { boardId: this.boardId }, (res) => {
      if (!res.ok) {
        useBoard.getState().setStatus("error", errorMessage(res));
        return;
      }
      useBoard.getState().applySnapshot(res.data);
      const replay = this.buffer;
      this.buffer = [];
      this.joined = true;
      replay.forEach((run) => run());
      useBoard.getState().setStatus("live");
    });
  }

  private resync(f: Failure): void {
    toast(errorMessage(f), "error");
    if (this.socket.connected) this.join();
  }

  private request<T>(run: (cb: (r: Ack<T>) => void) => void): Promise<Ack<T>> {
    return new Promise((resolve) => run(resolve));
  }

  // --- Board & lists -------------------------------------------------------

  renameBoard(title: string): void {
    this.socket.emit("board:rename", { title }, (r) => !r.ok && this.resync(r));
  }

  createList(title: string): void {
    this.socket.emit("list:create", { title }, (r) => !r.ok && this.resync(r));
  }

  renameList(id: string, title: string): void {
    this.socket.emit("list:update", { id, title }, (r) => !r.ok && this.resync(r));
  }

  deleteList(id: string): void {
    useBoard.getState().removeList(id);
    this.socket.emit("list:delete", { id }, (r) => !r.ok && this.resync(r));
  }

  moveList(id: string, toIndex: number): void {
    const store = useBoard.getState();
    const list = store.lists[id];
    if (!list) return;
    const siblings = Object.values(store.lists)
      .filter((l) => l.id !== id)
      .sort(byPosition);
    store.upsertList({ ...list, position: positionAtIndex(siblings, toIndex) });

    const seq = ++this.seq;
    this.pendingListMoves.set(id, seq);
    this.socket.emit("list:move", { id, toIndex }, (r) => {
      if (this.pendingListMoves.get(id) !== seq) return; // superseded by a newer move
      this.pendingListMoves.delete(id);
      if (r.ok) useBoard.getState().upsertList(r.data);
      else this.resync(r);
    });
  }

  // --- Cards ---------------------------------------------------------------

  createCard(listId: string, title: string): void {
    this.socket.emit("card:create", { listId, title }, (r) => !r.ok && this.resync(r));
  }

  /** Returns the raw ack so the editor can handle CONFLICT itself. */
  updateCard(id: string, version: number, patch: { title?: string; description?: string }): Promise<Ack<Card>> {
    return this.request<Card>((cb) => this.socket.emit("card:update", { id, version, ...patch }, cb));
  }

  deleteCard(id: string): void {
    useBoard.getState().removeCard(id);
    this.socket.emit("card:delete", { id }, (r) => !r.ok && this.resync(r));
  }

  moveCard(id: string, toListId: string, toIndex: number): void {
    const store = useBoard.getState();
    const card = store.cards[id];
    if (!card) return;
    const siblings = Object.values(store.cards)
      .filter((c) => c.listId === toListId && c.id !== id)
      .sort(byPosition);
    store.upsertCard({ ...card, listId: toListId, position: positionAtIndex(siblings, toIndex) });

    const seq = ++this.seq;
    this.pendingCardMoves.set(id, seq);
    this.socket.emit("card:move", { id, toListId, toIndex }, (r) => {
      if (this.pendingCardMoves.get(id) !== seq) return;
      this.pendingCardMoves.delete(id);
      if (r.ok) useBoard.getState().upsertCard(r.data);
      else this.resync(r);
    });
  }

  focusCard(cardId: string | null): void {
    this.socket.emit("card:focus", { cardId });
  }

  // --- Chat & cursors ------------------------------------------------------

  sendMessage(content: string): Promise<Ack<unknown>> {
    return this.request((cb) => this.socket.emit("chat:send", { content }, cb));
  }

  setTyping(typing: boolean): void {
    this.socket.emit("chat:typing", { typing });
  }

  /** Throttled to ~25 updates/s, always sending the trailing position. */
  moveCursor(x: number, y: number): void {
    const send = () => {
      this.lastCursorSent = Date.now();
      this.cursorTimer = null;
      this.socket.volatile.emit("cursor:move", { x: Math.round(x), y: Math.round(y) });
    };
    const wait = 40 - (Date.now() - this.lastCursorSent);
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    if (wait <= 0) send();
    else this.cursorTimer = setTimeout(send, wait);
  }
}
