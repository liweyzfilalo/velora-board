import Link from "next/link";
import { Logo } from "@/components/ui";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <Link href="/login" className="text-sm text-slate-300 hover:text-white">
          Se connecter
        </Link>
      </header>

      <section className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 pb-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Vos tableaux, en temps réel.</h1>
        <p className="mt-4 text-slate-400">
          Un Kanban à plusieurs : cartes, curseurs et chat se synchronisent instantanément.
        </p>
        <Link
          href="/boards"
          className="mt-8 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400"
        >
          Commencer
        </Link>
      </section>
    </main>
  );
}
