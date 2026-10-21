"use client";

import { useEffect, useState } from "react";
import type { Card } from "@velora/shared";
import { Avatar, Button, inputClass } from "@/components/ui";
import { errorMessage } from "@/lib/session";
import { useAuth } from "@/store/auth";
import { useBoard } from "@/store/board";
import { toast } from "@/store/toasts";
import { useSession } from "./SessionContext";

interface Draft {
  title: string;
  description: string;
}

const toDraft = (c: Card): Draft => ({ title: c.title, description: c.description });

export function CardEditor({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const session = useSession();
  const card = useBoard((s) => s.cards[cardId]);

  useEffect(() => {
    session.focusCard(cardId);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      session.focusCard(null);
      window.removeEventListener("keydown", onKey);
    };
  }, [session, cardId, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
      >
        {card ? (
          <Editor key={card.id} card={card} onClose={onClose} />
        ) : (
          <div className="py-6 text-center text-sm text-slate-400">
            <p>Cette carte a été supprimée par un autre membre.</p>
            <Button variant="ghost" className="mt-3" onClick={onClose}>
              Fermer
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Edits are based on a known `base` version. If the card changes on the server
 * while the user has unsaved edits (seen live, or reported by a CONFLICT ack),
 * we surface both versions instead of silently overwriting either one.
 */
function Editor({ card, onClose }: { card: Card; onClose: () => void }) {
  const session = useSession();
  const me = useAuth((s) => s.user);
  const members = useBoard((s) => s.members);
  const presence = useBoard((s) => s.presence);
  const listTitle = useBoard((s) => s.lists[card.listId]?.title);

  const [base, setBase] = useState(card);
  const [draft, setDraft] = useState<Draft>(() => toDraft(card));
  const [theirs, setTheirs] = useState<Card | null>(null);
  const [saving, setSaving] = useState(false);
  const [seenVersion, setSeenVersion] = useState(card.version);

  const dirty = draft.title !== base.title || draft.description !== base.description;

  // React to remote edits during render (no effect needed): adopt them if we
  // have nothing pending, otherwise flag a conflict.
  if (card.version !== seenVersion) {
    setSeenVersion(card.version);
    if (card.version > base.version) {
      if (dirty) setTheirs(card);
      else {
        setBase(card);
        setDraft(toDraft(card));
      }
    }
  }

  const otherEditors = presence.filter((u) => u.focusedCardId === card.id && u.id !== me?.id);
  const author = (c: Card) => members.find((m) => m.id === c.updatedBy)?.name ?? "Quelqu'un";

  async function save(version = base.version) {
    if (!draft.title.trim()) return;
    setSaving(true);
    const res = await session.updateCard(card.id, version, {
      title: draft.title.trim(),
      description: draft.description,
    });
    setSaving(false);
    if (res.ok) {
      setBase(res.data);
      setDraft(toDraft(res.data));
      setTheirs(null);
      toast("Carte enregistrée");
    } else if (res.code === "CONFLICT") {
      setTheirs(res.current as Card);
    } else {
      toast(errorMessage(res), "error");
      if (res.code === "NOT_FOUND") onClose();
    }
  }

  function acceptTheirs() {
    if (!theirs) return;
    setBase(theirs);
    setDraft(toDraft(theirs));
    setTheirs(null);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-400">
        <span>
          dans <span className="text-slate-200">{listTitle}</span> · v{base.version}
        </span>
        {otherEditors.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-200">
            <span className="flex -space-x-1.5">
              {otherEditors.map((u) => (
                <Avatar key={u.id} user={u} size={16} />
              ))}
            </span>
            {otherEditors.map((u) => u.name).join(", ")} édite{otherEditors.length > 1 ? "nt" : ""} aussi
          </span>
        )}
      </div>

      {theirs && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-100">
            {author(theirs)} a modifié cette carte pendant ton édition (v{theirs.version}).
          </p>
          <div className="mt-2 rounded-lg bg-black/30 p-2 text-xs text-slate-300">
            <p className="font-medium text-slate-100">{theirs.title}</p>
            {theirs.description && <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{theirs.description}</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="ghost" className="border border-white/10" onClick={acceptTheirs}>
              Prendre leur version
            </Button>
            <Button type="button" onClick={() => void save(theirs.version)} disabled={saving}>
              Écraser avec la mienne
            </Button>
          </div>
        </div>
      )}

      <input
        className={`${inputClass} text-base font-medium`}
        value={draft.title}
        maxLength={200}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Titre"
        autoFocus
      />
      <textarea
        className={`${inputClass} mt-3 min-h-40 resize-y`}
        value={draft.description}
        maxLength={10_000}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        placeholder="Ajoute une description…"
      />

      <div className="mt-4 flex items-center justify-between">
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            if (confirm("Supprimer cette carte ?")) {
              session.deleteCard(card.id);
              onClose();
            }
          }}
        >
          Supprimer
        </Button>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">Ctrl+Entrée</span>
          <Button type="button" variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          <Button type="submit" disabled={!dirty || saving || !!theirs}>
            {saving ? "…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </form>
  );
}
