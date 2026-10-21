import { Suspense } from "react";
import { BoardView } from "@/components/board/BoardView";
import { FullPageSpinner } from "@/components/ui";

export default function BoardPage() {
  return (
    <Suspense fallback={<FullPageSpinner label="Chargement du tableau…" />}>
      <BoardView />
    </Suspense>
  );
}
