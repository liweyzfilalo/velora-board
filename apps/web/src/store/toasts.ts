import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
}

interface ToastState {
  toasts: Toast[];
  push(message: string, tone?: Toast["tone"]): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push(message, tone = "info") {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, tone }].slice(-4) });
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = (message: string, tone?: Toast["tone"]) => useToasts.getState().push(message, tone);
