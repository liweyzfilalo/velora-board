"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Board } from "@velora/shared";
import { FullPageSpinner, RequireAuth } from "@/components/ui";
import { api } from "@/lib/api";

export function JoinBoard() {
  return (
    <RequireAuth>
      <Join />
    </RequireAuth>
  );
}

function Join() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<Board>(`/boards/join/${encodeURIComponent(code)}`, { method: "POST" })
      .then((board) => router.replace(`/boards/${board.id}`))
      .catch(() => setFailed(true));
  }, [code, router]);

  if (!failed) return <FullPageSpinner label="Connexion au tableau…" />;
  return (
    <div className="grid flex-1 place-items-center text-center text-sm text-slate-400">
      <div>
        <p>Ce lien d&apos;invitation n&apos;est pas valide.</p>
        <Link href="/boards" className="mt-3 inline-block text-indigo-300 hover:underline">
          Retour à mes tableaux
        </Link>
      </div>
    </div>
  );
}
