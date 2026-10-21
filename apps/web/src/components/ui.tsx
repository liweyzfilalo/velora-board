"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PublicUser } from "@velora/shared";
import { useAuth } from "@/store/auth";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm text-white">
        V
      </span>
      Velora Board
    </Link>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function Avatar({
  user,
  size = 28,
  ring,
  title,
}: {
  user: Pick<PublicUser, "name" | "color">;
  size?: number;
  ring?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title ?? user.name}
      className={`inline-grid shrink-0 select-none place-items-center rounded-full font-semibold text-white ${
        ring ? "ring-2 ring-[#0b0d14]" : ""
      }`}
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.4 }}
    >
      {initials(user.name)}
    </span>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-indigo-500 text-white hover:bg-indigo-400 disabled:bg-indigo-500/50",
    ghost: "text-slate-300 hover:bg-white/10 hover:text-white",
    danger: "text-red-300 hover:bg-red-500/15 hover:text-red-200",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
}

export const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30";

/** Redirects to /login once auth state is known and there is no session. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { hydrated, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !token) router.replace(`/login?next=${encodeURIComponent(location.pathname)}`);
  }, [hydrated, token, router]);

  if (!hydrated || !token) return <FullPageSpinner />;
  return <>{children}</>;
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="grid flex-1 place-items-center gap-3 py-24 text-sm text-slate-400">
      <div className="flex flex-col items-center gap-3">
        <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
        {label}
      </div>
    </div>
  );
}
