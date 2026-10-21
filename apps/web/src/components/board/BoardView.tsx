"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { FullPageSpinner, RequireAuth } from "@/components/ui";
import { useBoard } from "@/store/board";
import { BoardCanvas } from "./BoardCanvas";
import { BoardHeader } from "./BoardHeader";
import { CardEditor } from "./CardEditor";
import { ChatPanel } from "./ChatPanel";
import { BoardSessionProvider } from "./SessionContext";

export function BoardView() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <BoardSessionProvider boardId={id}>
        <BoardLayout />
      </BoardSessionProvider>
    </RequireAuth>
  );
}

function BoardLayout() {
  const hasBoard = useBoard((s) => s.board !== null);
  const status = useBoard((s) => s.status);
  const error = useBoard((s) => s.error);
  const chatOpen = useBoard((s) => s.chatOpen);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  if (status === "error" && !hasBoard) {
    return (
      <div className="grid flex-1 place-items-center text-center text-sm text-slate-400">
        <div>
          <p>{error ?? "Impossible d'ouvrir ce tableau."}</p>
          <Link href="/boards" className="mt-3 inline-block text-indigo-300 hover:underline">
            Retour à mes tableaux
          </Link>
        </div>
      </div>
    );
  }
  if (!hasBoard) return <FullPageSpinner label="Connexion en temps réel…" />;

  return (
    <div className="flex h-dvh flex-col">
      <BoardHeader />
      <div className="relative flex min-h-0 flex-1">
        <BoardCanvas onOpenCard={setOpenCardId} />
        {chatOpen && <ChatPanel />}
      </div>
      {openCardId && <CardEditor cardId={openCardId} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
