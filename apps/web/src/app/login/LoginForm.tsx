"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthResponse } from "@velora/shared";
import { Button, Logo, inputClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/store/auth";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/boards";
  const { token, hydrated, setSession } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hydrated && token) router.replace(next);
  }, [hydrated, token, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await api<AuthResponse>(`/auth/${mode}`, {
        method: "POST",
        body: mode === "login" ? { email: form.email, password: form.password } : form,
      });
      setSession(session);
    } catch (err) {
      const e = err as ApiError;
      setError(
        e.code === "CONFLICT"
          ? "Cet email est déjà utilisé."
          : e.code === "UNAUTHORIZED"
            ? "Email ou mot de passe incorrect."
            : e.code === "VALIDATION"
              ? "Vérifie les champs (mot de passe : 6 caractères minimum)."
              : e.code === "RATE_LIMITED"
                ? "Trop de tentatives, réessaie dans une minute."
                : "Impossible de joindre le serveur.",
      );
    } finally {
      setLoading(false);
    }
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <main className="bg-grid flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center text-lg" />
        <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur">
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-white/5 p-1 text-sm">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md py-1.5 transition ${mode === m ? "bg-white/10 text-white" : "text-slate-400"}`}
              >
                {m === "login" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {mode === "register" && (
              <input className={inputClass} placeholder="Nom affiché" required maxLength={50} {...field("name")} />
            )}
            <input className={inputClass} type="email" placeholder="Email" required autoComplete="email" {...field("email")} />
            <input
              className={inputClass}
              type="password"
              placeholder="Mot de passe"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              {...field("password")}
            />
          </div>

          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-5 w-full">
            {loading ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </Button>
        </form>
      </div>
    </main>
  );
}
