"use client";

import { useToasts } from "@/store/toasts";

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`animate-toast-in pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-xl backdrop-blur ${
            t.tone === "error"
              ? "border-red-500/40 bg-red-950/90 text-red-100"
              : "border-white/10 bg-slate-900/90 text-slate-100"
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
