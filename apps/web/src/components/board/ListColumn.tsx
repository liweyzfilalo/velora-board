"use client";

import { memo } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import type { Card, List } from "@synkro/shared";
import { CardTile } from "./CardTile";
import { Composer, InlineEdit } from "./InlineEdit";
import { useSession } from "./SessionContext";

export const ListColumn = memo(function ListColumn({
  list,
  index,
  cards,
  onOpenCard,
}: {
  list: List;
  index: number;
  cards: Card[];
  onOpenCard: (id: string) => void;
}) {
  const session = useSession();

  return (
    <Draggable draggableId={list.id} index={index}>
      {(drag, snapshot) => (
        <section
          ref={drag.innerRef}
          {...drag.draggableProps}
          className={`mr-3 flex w-72 shrink-0 flex-col rounded-xl border border-white/10 bg-slate-900/80 backdrop-blur ${
            snapshot.isDragging ? "rotate-1 shadow-2xl shadow-black/50" : ""
          }`}
        >
          <header {...drag.dragHandleProps} className="group flex items-center gap-2 px-3 pt-3 pb-2">
            <InlineEdit
              value={list.title}
              onCommit={(t) => session.renameList(list.id, t)}
              className="min-w-0 flex-1 rounded px-1 text-sm font-medium text-slate-100 hover:bg-white/5"
              inputClassName="flex-1 text-sm text-white"
            />
            <span className="rounded-full bg-white/5 px-2 text-xs text-slate-400">{cards.length}</span>
            <button
              onClick={() => {
                if (cards.length === 0 || confirm(`Supprimer « ${list.title} » et ses ${cards.length} carte(s) ?`)) {
                  session.deleteList(list.id);
                }
              }}
              title="Supprimer la liste"
              className="rounded p-0.5 text-xs text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-red-300"
            >
              ✕
            </button>
          </header>

          <Droppable droppableId={list.id} type="CARD">
            {(drop, dropSnapshot) => (
              <div
                ref={drop.innerRef}
                {...drop.droppableProps}
                className={`mx-2 flex min-h-2 flex-col gap-2 rounded-lg transition-colors ${
                  dropSnapshot.isDraggingOver ? "bg-indigo-500/10" : ""
                }`}
              >
                {cards.map((card, i) => (
                  <CardTile key={card.id} card={card} index={i} onOpen={onOpenCard} />
                ))}
                {drop.placeholder}
              </div>
            )}
          </Droppable>

          <Composer
            label="Ajouter une carte"
            placeholder="Titre de la carte…"
            onSubmit={(t) => session.createCard(list.id, t)}
            className="p-2"
          />
        </section>
      )}
    </Draggable>
  );
});
