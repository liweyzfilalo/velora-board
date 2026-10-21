"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Board, BoardSummary } from "@velora/shared";
import { AppHeader } from "@/components/AppHeader";
import { Button, FullPageSpinner, RequireAuth, inputClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { toast } from "@/store/toasts";

export default function BoardsPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <BoardsList />
    </RequireAuth>
  );
}

/** Accepts either a raw invite code or a full /join/<code> link. */
const parseInvite = (input: string) => input.trim().split("/join/").pop()!.replace(/\/$/, "");

function BoardsList() {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [title, setTitle] = useState("");
  const [invite, setInvite] = useState("");

  const load = useCallback(() => {
    api<BoardSummary[]>("/boards")
      .then(setBoards)
      .catch(() => toast("Impossible de charger les tableaux", "error"));
  }, []);

  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const board = await api<Board>("/boards", { method: "POST", body: { title } });
    router.push(`/boards/${board.id}`);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!invite.trim()) return;
    try {
      const board = await api<Board>(`/boards/join/${encodeURIComponent(parseInvite(invite))}`, { method: "POST" });
      router.push(`/boards/${board.id}`);
    } catch (err) {
      toast((err as ApiError).status === 404 ? "Code d'invitation invalide" : "Erreur", "error");
    }
  }

  async function remove(board: BoardSummary) {
    if (!confirm(`Supprimer « ${board.title} » pour tous les membres ?`)) return;
    await api(`/boards/${board.id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        <form onSubmit={create} className="flex gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
          <input
            className={inputClass}
            placeholder="Nom du nouveau tableau"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button type="submit" className="shrink-0">
            Créer
          </Button>
        </form>
        <form onSubmit={join} className="flex gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3">
          <input
            className={inputClass}
            placeholder="Lien ou code d'invitation"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
          />
          <Button type="submit" variant="ghost" className="shrink-0 border border-white/10">
            Rejoindre
          </Button>
        </form>
      </div>

      <h1 className="mb-4 text-lg font-semibold text-white">Mes tableaux</h1>
      {!boards ? (
        <FullPageSpinner />
      ) : boards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-400">
          Aucun tableau pour l&apos;instant. Crée le premier ci-dessus, ou rejoins celui d&apos;un collègue.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <li key={b.id} className="group relative">
              <Link
                href={`/boards/${b.id}`}
                className="block h-full rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-900/40 p-5 transition hover:border-indigo-400/50 hover:shadow-lg hover:shadow-indigo-500/10"
              >
                <h2 className="truncate pr-8 font-medium text-white">{b.title}</h2>
                <p className="mt-3 text-xs text-slate-400">
                  {b.cardCount} carte{b.cardCount > 1 ? "s" : ""} · {b.memberCount} membre{b.memberCount > 1 ? "s" : ""}
                  {b.role === "owner" && " · propriétaire"}
                </p>
              </Link>
              {b.role === "owner" && (
                <button
                  onClick={() => remove(b)}
                  title="Supprimer"
                  className="absolute top-4 right-4 rounded p-1 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-300"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
