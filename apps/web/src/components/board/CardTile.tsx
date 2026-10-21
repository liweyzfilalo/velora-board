"use client";

import { memo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import type { Card } from "@synkro/shared";
import { Avatar } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { useBoard } from "@/store/board";

export const CardTile = memo(function CardTile({
  card,
  index,
  onOpen,
}: {
  card: Card;
  index: number;
  onOpen: (id: string) => void;
}) {
  const meId = useAuth((s) => s.user?.id);
  const presence = useBoard((s) => s.presence);
  const editors = presence.filter((u) => u.focusedCardId === card.id && u.id !== meId);

  return (
    <Draggable draggableId={card.id} index={index}>
      {(drag, snapshot) => (
        <article
          ref={drag.innerRef}
          {...drag.draggableProps}
          {...drag.dragHandleProps}
          onClick={() => onOpen(card.id)}
          className={`group cursor-pointer rounded-lg border bg-slate-800/90 px-3 py-2.5 text-sm text-slate-100 shadow-sm transition-colors hover:border-indigo-400/40 hover:bg-slate-800 ${
            snapshot.isDragging ? "rotate-2 border-indigo-400/60 shadow-xl shadow-black/40" : "border-white/5"
          }`}
          style={{
            ...drag.draggableProps.style,
            ...(editors[0] ? { boxShadow: `0 0 0 2px ${editors[0].color}` } : {}),
          }}
        >
          <p className="break-words whitespace-pre-wrap">{card.title}</p>
          {(card.description || editors.length > 0) && (
            <div className="mt-2 flex items-center justify-between gap-2">
              {card.description ? (
                <span className="text-xs text-slate-500" title="Contient une description">
                  ≡ description
                </span>
              ) : (
                <span />
              )}
              {editors.length > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  édite
                  <span className="flex -space-x-1.5">
                    {editors.map((u) => (
                      <Avatar key={u.id} user={u} size={18} ring />
                    ))}
                  </span>
                </span>
              )}
            </div>
          )}
        </article>
      )}
    </Draggable>
  );
});
