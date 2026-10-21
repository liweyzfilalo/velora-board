"use client";

import { useRouter } from "next/navigation";
import { Avatar, Button, Logo } from "@/components/ui";
import { useAuth } from "@/store/auth";

export function AppHeader() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const router = useRouter();

  return (
    <header className="border-b border-white/10 bg-slate-950/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Logo />
        {user && (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-300 sm:inline">{user.name}</span>
            <Avatar user={user} />
            <Button
              variant="ghost"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              Déconnexion
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
