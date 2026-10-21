export interface PublicUser {
  id: string;
  name: string;
  color: string;
}

export interface User extends PublicUser {
  email: string;
}

export type BoardRole = "owner" | "member";

export interface Board {
  id: string;
  title: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
}

export interface BoardSummary extends Board {
  role: BoardRole;
  memberCount: number;
  cardCount: number;
}

export interface List {
  id: string;
  boardId: string;
  title: string;
  position: number;
  version: number;
}

export interface Card {
  id: string;
  boardId: string;
  listId: string;
  title: string;
  description: string;
  position: number;
  /** Incremented on every content edit (title/description). Used for optimistic locking. */
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ChatMessage {
  id: string;
  boardId: string;
  user: PublicUser;
  content: string;
  createdAt: string;
}

export interface BoardSnapshot {
  board: Board;
  lists: List[];
  cards: Card[];
  members: PublicUser[];
}

export interface PresenceUser extends PublicUser {
  focusedCardId: string | null;
  /** Number of open connections (tabs) for this user on the board. */
  connections: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}
