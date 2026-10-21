import type { Board, BoardSnapshot, Card, ChatMessage, List, PresenceUser } from "./types";

export type ErrorCode =
  | "CONFLICT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "INTERNAL";

export type Ack<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      code: ErrorCode;
      /** On CONFLICT, the authoritative server state so the client can reconcile. */
      current?: unknown;
    };

type AckFn<T> = (res: Ack<T>) => void;

export interface JoinResult {
  snapshot: BoardSnapshot;
  presence: PresenceUser[];
  messages: ChatMessage[];
}

export interface ClientToServerEvents {
  "board:join": (p: { boardId: string }, ack: AckFn<JoinResult>) => void;
  "board:leave": () => void;
  "board:rename": (p: { title: string }, ack: AckFn<Board>) => void;

  "list:create": (p: { title: string }, ack: AckFn<List>) => void;
  "list:update": (p: { id: string; title: string }, ack: AckFn<List>) => void;
  "list:delete": (p: { id: string }, ack: AckFn<{ id: string }>) => void;
  "list:move": (p: { id: string; toIndex: number }, ack: AckFn<List>) => void;

  "card:create": (p: { listId: string; title: string }, ack: AckFn<Card>) => void;
  "card:update": (
    p: { id: string; version: number; title?: string; description?: string },
    ack: AckFn<Card>,
  ) => void;
  "card:delete": (p: { id: string }, ack: AckFn<{ id: string }>) => void;
  "card:move": (p: { id: string; toListId: string; toIndex: number }, ack: AckFn<Card>) => void;
  "card:focus": (p: { cardId: string | null }) => void;

  "chat:send": (p: { content: string }, ack: AckFn<ChatMessage>) => void;
  "chat:typing": (p: { typing: boolean }) => void;

  /** Coordinates in board-canvas pixels (columns have a fixed width, so they line up across screens). */
  "cursor:move": (p: { x: number; y: number }) => void;
}

export interface ServerToClientEvents {
  "board:updated": (board: Board) => void;
  "board:deleted": () => void;
  "member:joined": (p: { id: string; name: string; color: string }) => void;

  "list:upserted": (list: List) => void;
  "list:deleted": (p: { id: string }) => void;
  "lists:rebalanced": (p: { positions: Record<string, number> }) => void;

  "card:upserted": (card: Card) => void;
  "card:deleted": (p: { id: string }) => void;
  "cards:rebalanced": (p: { listId: string; positions: Record<string, number> }) => void;

  "chat:message": (m: ChatMessage) => void;
  "chat:typing": (p: { userId: string; name: string; typing: boolean }) => void;

  "presence:update": (users: PresenceUser[]) => void;
  "cursor:update": (p: { userId: string; x: number; y: number }) => void;
  "cursor:leave": (p: { userId: string }) => void;
}
