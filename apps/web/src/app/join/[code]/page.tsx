import { Suspense } from "react";
import { FullPageSpinner } from "@/components/ui";
import { JoinBoard } from "./JoinBoard";

export default function JoinPage() {
  return (
    <Suspense fallback={<FullPageSpinner label="Connexion au tableau…" />}>
      <JoinBoard />
    </Suspense>
  );
}
