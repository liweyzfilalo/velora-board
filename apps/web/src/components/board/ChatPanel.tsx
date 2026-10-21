"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { errorMessage } from "@/lib/session";
import { useAuth } from "@/store/auth";
import { useBoard } from "@/store/board";
import { toast } from "@/store/toasts";
import { useSession } from "./SessionContext";

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function ChatPanel() {
  const session = useSession();
  const me = useAuth((s) => s.user);
  const messages = useBoard((s) => s.messages);
  const typing = useBoard((s) => s.typing);
  const setChatOpen = useBoard((s) => s.setChatOpen);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(
    () => () => {
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
        session.setTyping(false);
      }
    },
    [session],
  );

  function onChange(value: string) {
    setText(value);
    if (!typingTimer.current) session.setTyping(true);
    else clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
      session.setTyping(false);
    }, 2000);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText("");
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    session.setTyping(false);
    const res = await session.sendMessage(content);
    if (!res.ok) {
      toast(errorMessage(res), "error");
      setText(content);
    }
  }

  const typers = Object.values(typing);

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-80 flex-col border-l border-white/10 bg-slate-950/95 backdrop-blur sm:static sm:w-80">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-medium text-white">Discussion</h2>
        <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-white" title="Fermer">
          ✕
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && <p className="mt-8 text-center text-xs text-slate-500">Aucun message. Dis bonjour 👋</p>}
        {messages.map((m, i) => {
          const grouped = messages[i - 1]?.user.id === m.user.id;
          const mine = m.user.id === me?.id;
          return (
            <div key={m.id} className={`flex gap-2 ${grouped ? "" : "pt-2"}`}>
              <div className="w-7 shrink-0">{!grouped && <Avatar user={m.user} />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="text-xs">
                    <span className="font-medium" style={{ color: m.user.color }}>
                      {mine ? "Vous" : m.user.name}
                    </span>
                    <span className="ml-2 text-slate-500">{time.format(new Date(m.createdAt))}</span>
                  </p>
                )}
                <p className="text-sm break-words whitespace-pre-wrap text-slate-200">{m.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="h-5 px-4 text-[11px] text-slate-500">
        {typers.length > 0 && `${typers.join(", ")} ${typers.length > 1 ? "écrivent" : "écrit"}…`}
      </p>
      <form onSubmit={send} className="border-t border-white/10 p-3">
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          maxLength={2000}
          placeholder="Écrire un message…"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400"
        />
      </form>
    </aside>
  );
}
