import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, User } from "@velora/shared";

export interface SocketData {
  user: User;
  boardId: string | null;
  focusedCardId: string | null;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: IoServer | null = null;

export function setIo(server: IoServer): void {
  io = server;
}

export function getIo(): IoServer {
  if (!io) throw new Error("Socket.io server not initialised");
  return io;
}

export const boardRoom = (boardId: string) => `board:${boardId}`;
