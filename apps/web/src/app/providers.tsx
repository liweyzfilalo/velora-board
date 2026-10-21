"use client";

import { useEffect } from "react";
import { Toaster } from "@/components/Toaster";
import { useAuth } from "@/store/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(() => hydrate(), [hydrate]);

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
