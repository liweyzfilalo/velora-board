"use client";

import { useEffect, useState } from "react";
import { useBoard } from "@/store/board";

const STALE_MS = 10_000;

/** Other members' pointers, in board-canvas coordinates. */
export function CursorsLayer() {
  const cursors = useBoard((s) => s.cursors);
  const presence = useBoard((s) => s.presence);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {presence.map((u) => {
        const c = cursors[u.id];
        if (!c || now - c.at > STALE_MS) return null;
        return (
          <div
            key={u.id}
            className="absolute top-0 left-0 transition-transform duration-75 ease-linear will-change-transform"
            style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" className="drop-shadow">
              <path d="M1 1 L1 15 L5 11 L8 17 L10.5 16 L7.5 10 L13 10 Z" fill={u.color} stroke="white" strokeWidth="1.2" />
            </svg>
            <span
              className="ml-3 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow"
              style={{ background: u.color }}
            >
              {u.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
