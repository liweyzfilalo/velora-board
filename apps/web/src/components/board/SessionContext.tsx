"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BoardSession } from "@/lib/session";
import { useAuth } from "@/store/auth";
import { useBoard } from "@/store/board";
import { toast } from "@/store/toasts";

const SessionContext = createContext<BoardSession | null>(null);

export function useSession(): BoardSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <BoardSessionProvider>");
  return session;
}

export function BoardSessionProvider({ boardId, children }: { boardId: string; children: React.ReactNode }) {
  const token = useAuth((s) => s.token)!;
  const router = useRouter();

  const session = useMemo(
    () =>
      new BoardSession(boardId, token, {
        onUnauthorized: () => useAuth.getState().logout(),
        onBoardDeleted: () => {
          toast("Ce tableau a été supprimé par son propriétaire", "error");
          router.replace("/boards");
        },
      }),
    [boardId, token, router],
  );

  useEffect(() => {
    session.start();
    return () => {
      session.stop();
      useBoard.getState().reset();
    };
  }, [session]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
