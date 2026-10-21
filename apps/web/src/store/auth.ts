import { create } from "zustand";
import type { AuthResponse, User } from "@velora/shared";

const STORAGE_KEY = "velora-board.auth";

interface AuthState {
  token: string | null;
  user: User | null;
  /** False until localStorage has been read on the client. */
  hydrated: boolean;
  hydrate(): void;
  setSession(session: AuthResponse): void;
  logout(): void;
}

export const useAuth = create<AuthState>()((set) => ({
  token: null,
  user: null,
  hydrated: false,

  hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const session = raw ? (JSON.parse(raw) as AuthResponse) : null;
      set({ token: session?.token ?? null, user: session?.user ?? null, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  setSession(session) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {}
    set({ token: session.token, user: session.user });
  },

  logout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    set({ token: null, user: null });
  },
}));
