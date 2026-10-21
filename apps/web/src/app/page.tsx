import Link from "next/link";
import { Logo } from "@/components/ui";

const FEATURES = [
  {
    title: "Synchronisation instantanée",
    body: "Chaque action est diffusée via WebSockets à tous les membres, quelle que soit l'instance API à laquelle ils sont connectés (Redis pub/sub).",
  },
  {
    title: "Présence & curseurs live",
    body: "Vois qui est sur le tableau, où se trouve son curseur et quelle carte il est en train d'éditer.",
  },
  {
    title: "Concurrence maîtrisée",
    body: "Verrouillage optimiste par version sur les éditions, verrous de ligne PostgreSQL sur l'ordonnancement : aucune perte, aucune collision.",
  },
  {
    title: "UI optimiste",
    body: "Le glisser-déposer s'applique immédiatement côté client, puis se réconcilie avec l'état autoritaire du serveur.",
  },
  {
    title: "Chat d'équipe",
    body: "Une discussion par tableau, avec indicateur de saisie et limitation de débit partagée entre instances.",
  },
  {
    title: "Cache cohérent",
    body: "Snapshots de tableau mis en cache dans Redis, invalidés par numéro de révision pour éviter toute donnée périmée.",
  },
];

export default function Home() {
  return (
    <main className="bg-grid relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-96 max-w-3xl rounded-full bg-indigo-600/25 blur-3xl" />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <Link href="/login" className="text-sm text-slate-300 hover:text-white">
          Se connecter
        </Link>
      </header>

      <section className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pt-16 pb-20 text-center sm:pt-24">
        <span className="mb-5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          Next.js · Socket.io · PostgreSQL · Redis
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          Vos tableaux, <span className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">en temps réel</span>.
        </h1>
        <p className="mt-5 max-w-xl text-base text-slate-400 sm:text-lg">
          Un Kanban collaboratif où chaque déplacement, chaque édition et chaque message apparaît instantanément chez toute
          l&apos;équipe.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/boards"
            className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Commencer gratuitement
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5"
          >
            J&apos;ai un compte
          </Link>
        </div>
      </section>

      <section className="relative mx-auto grid w-full max-w-6xl gap-4 px-4 pb-24 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur">
            <h3 className="font-medium text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
