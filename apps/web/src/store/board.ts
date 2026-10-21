import { create } from "zustand";
import type { Board, Card, ChatMessage, JoinResult, List, PresenceUser, PublicUser } from "@synkro/shared";

export type ConnectionStatus = "connecting" | "syncing" | "live" | "offline" | "error";

export interface Cursor {
  x: number;
  y: number;
  at: number;
}

interface BoardState {
  status: ConnectionStatus;
  error: string | null;
  board: Board | null;
  lists: Record<string, List>;
  cards: Record<string, Card>;
  members: PublicUser[];
  presence: PresenceUser[];
  messages: ChatMessage[];
  typing: Record<string, string>;
  cursors: Record<string, Cursor>;
  chatOpen: boolean;
  unread: number;

  reset(): void;
  setStatus(status: ConnectionStatus, error?: string | null): void;
  applySnapshot(r: JoinResult): void;
  setBoard(board: Board): void;
  addMember(user: PublicUser): void;

  upsertList(list: List, opts?: { keepPlacement?: boolean }): void;
  removeList(id: string): void;
  setListPositions(positions: Record<string, number>): void;

  upsertCard(card: Card, opts?: { keepPlacement?: boolean }): void;
  removeCard(id: string): void;
  setCardPositions(positions: Record<string, number>): void;

  setPresence(users: PresenceUser[]): void;
  addMessage(m: ChatMessage): void;
  setTyping(userId: string, name: string, typing: boolean): void;
  setCursor(userId: string, x: number, y: number): void;
  removeCursor(userId: string): void;
  setChatOpen(open: boolean): void;
}

const initial = {
  status: "connecting" as ConnectionStatus,
  error: null,
  board: null,
  lists: {},
  cards: {},
  members: [],
  presence: [],
  messages: [],
  typing: {},
  cursors: {},
  chatOpen: false,
  unread: 0,
};

const byId = <T extends { id: string }>(items: T[]) => Object.fromEntries(items.map((i) => [i.id, i]));

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

/**
 * Normalised board state. Every server event carries the full entity, so
 * reducers are idempotent "replace by id" operations; replaying an event
 * twice (e.g. after a resync) is harmless.
 */
export const useBoard = create<BoardState>()((set, get) => ({
  ...initial,

  reset: () => set(initial),
  setStatus: (status, error = null) => set({ status, error }),

  applySnapshot: ({ snapshot, presence, messages }) =>
    set({
      board: snapshot.board,
      lists: byId(snapshot.lists),
      cards: byId(snapshot.cards),
      members: snapshot.members,
      presence,
      messages,
    }),

  setBoard: (board) => set({ board }),
  addMember: (user) => {
    if (get().members.some((m) => m.id === user.id)) return;
    set({ members: [...get().members, user] });
  },

  upsertList: (list, opts) => {
    const local = get().lists[list.id];
    const next = opts?.keepPlacement && local ? { ...list, position: local.position } : list;
    set({ lists: { ...get().lists, [list.id]: next } });
  },
  removeList: (id) => {
    const lists = omit(get().lists, id);
    const cards = Object.fromEntries(Object.entries(get().cards).filter(([, c]) => c.listId !== id));
    set({ lists, cards });
  },
  setListPositions: (positions) => {
    const lists = { ...get().lists };
    for (const [id, position] of Object.entries(positions)) if (lists[id]) lists[id] = { ...lists[id], position };
    set({ lists });
  },

  upsertCard: (card, opts) => {
    const local = get().cards[card.id];
    // Never let an older content version overwrite a newer one we already hold.
    const content = local && local.version > card.version ? local : card;
    const placement = opts?.keepPlacement && local ? local : card;
    set({
      cards: {
        ...get().cards,
        [card.id]: { ...content, listId: placement.listId, position: placement.position },
      },
    });
  },
  removeCard: (id) => {
    set({ cards: omit(get().cards, id) });
  },
  setCardPositions: (positions) => {
    const cards = { ...get().cards };
    for (const [id, position] of Object.entries(positions)) if (cards[id]) cards[id] = { ...cards[id], position };
    set({ cards });
  },

  setPresence: (presence) => set({ presence }),
  addMessage: (m) => {
    if (get().messages.some((x) => x.id === m.id)) return;
    set({ messages: [...get().messages, m].slice(-200), unread: get().chatOpen ? 0 : get().unread + 1 });
  },
  setTyping: (userId, name, typing) => {
    const rest = omit(get().typing, userId);
    set({ typing: typing ? { ...rest, [userId]: name } : rest });
  },
  setCursor: (userId, x, y) => set({ cursors: { ...get().cursors, [userId]: { x, y, at: Date.now() } } }),
  removeCursor: (userId) => {
    set({ cursors: omit(get().cursors, userId) });
  },
  setChatOpen: (chatOpen) => set({ chatOpen, unread: 0 }),
}));
