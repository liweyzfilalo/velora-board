"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { useBoard, type ConnectionStatus } from "@/store/board";
import { toast } from "@/store/toasts";
import { InlineEdit } from "./InlineEdit";
import { useSession } from "./SessionContext";

const STATUS: Record<ConnectionStatus, { label: string; dot: string }> = {
  live: { label: "En direct", dot: "bg-emerald-400" },
  syncing: { label: "Synchronisation…", dot: "bg-amber-400 animate-pulse" },
  connecting: { label: "Connexion…", dot: "bg-amber-400 animate-pulse" },
  offline: { label: "Hors ligne — reconnexion…", dot: "bg-red-400 animate-pulse" },
  error: { label: "Erreur", dot: "bg-red-400" },
};

const MAX_AVATARS = 5;

export function BoardHeader() {
  const session = useSession();
  const board = useBoard((s) => s.board)!;
  const status = useBoard((s) => s.status);
  const presence = useBoard((s) => s.presence);
  const chatOpen = useBoard((s) => s.chatOpen);
  const unread = useBoard((s) => s.unread);
  const setChatOpen = useBoard((s) => s.setChatOpen);
  const me = useAuth((s) => s.user);

  const online = [...presence].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0));
  const { label, dot } = STATUS[status];

  async function copyInvite() {
    const link = `${location.origin}/join/${board.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      toast("Lien d'invitation copié");
    } catch {
      prompt("Lien d'invitation :", link);
    }
  }

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-slate-950/70 px-4 py-2.5 backdrop-blur">
      <Link href="/boards" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Mes tableaux">
        ←
      </Link>
      <InlineEdit
        value={board.title}
        onCommit={(t) => session.renameBoard(t)}
        maxLength={100}
        className="max-w-[40vw] rounded-md px-1.5 py-0.5 font-semibold text-white hover:bg-white/10"
        inputClassName="font-semibold text-white"
      />
      <span className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
        <span className={`size-2 rounded-full ${dot}`} />
        {label}
      </span>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex -space-x-2">
          {online.slice(0, MAX_AVATARS).map((u) => (
            <Avatar
              key={u.id}
              user={u}
              ring
              title={`${u.name}${u.id === me?.id ? " (vous)" : ""}${u.connections > 1 ? ` · ${u.connections} onglets` : ""}`}
            />
          ))}
          {online.length > MAX_AVATARS && (
            <span className="grid size-7 place-items-center rounded-full bg-slate-700 text-[11px] text-white ring-2 ring-[#0b0d14]">
              +{online.length - MAX_AVATARS}
            </span>
          )}
        </div>
        <button
          onClick={copyInvite}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5"
        >
          Inviter
        </button>
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className={`relative rounded-lg px-3 py-1.5 text-sm transition ${
            chatOpen ? "bg-indigo-500/20 text-indigo-200" : "text-slate-300 hover:bg-white/10"
          }`}
        >
          Chat
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-semibold text-white">
              {unread}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
