"use client";

import { useMemo, useRef } from "react";
import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";
import { byPosition, type Card } from "@velora/shared";
import { useBoard } from "@/store/board";
import { Composer } from "./InlineEdit";
import { CursorsLayer } from "./CursorsLayer";
import { ListColumn } from "./ListColumn";
import { useSession } from "./SessionContext";

export function BoardCanvas({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const session = useSession();
  const lists = useBoard((s) => s.lists);
  const cards = useBoard((s) => s.cards);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sortedLists = useMemo(() => Object.values(lists).sort(byPosition), [lists]);
  const cardsByList = useMemo(() => {
    const groups: Record<string, Card[]> = {};
    for (const c of Object.values(cards)) (groups[c.listId] ??= []).push(c);
    for (const g of Object.values(groups)) g.sort(byPosition);
    return groups;
  }, [cards]);

  function onDragEnd({ source, destination, draggableId, type }: DropResult) {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    // hello-pangea's destination.index is the index in the final list, i.e. among
    // siblings *excluding* the dragged item — exactly what the server expects.
    if (type === "LIST") session.moveList(draggableId, destination.index);
    else session.moveCard(draggableId, destination.droppableId, destination.index);
  }

  function onPointerMove(e: React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) session.moveCursor(e.clientX - rect.left, e.clientY - rect.top);
  }

  return (
    <div className="bg-grid min-w-0 flex-1 overflow-auto bg-gradient-to-br from-slate-950 via-[#0d1020] to-[#140d22]">
      <div ref={canvasRef} onPointerMove={onPointerMove} className="relative inline-flex min-h-full min-w-full items-start gap-3 p-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="board" direction="horizontal" type="LIST">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex items-start">
                {sortedLists.map((list, index) => (
                  <ListColumn
                    key={list.id}
                    list={list}
                    index={index}
                    cards={cardsByList[list.id] ?? []}
                    onOpenCard={onOpenCard}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <div className="w-72 shrink-0 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-2">
          <Composer label="Ajouter une liste" placeholder="Titre de la liste…" onSubmit={(t) => session.createList(t)} />
        </div>

        <CursorsLayer />
      </div>
    </div>
  );
}
