# Synkro — Kanban collaboratif en temps réel

Application SaaS de gestion collaborative façon Trello : plusieurs utilisateurs éditent le même tableau, déplacent des cartes, voient les curseurs des autres et discutent. Tout est synchronisé instantanément.

**Stack** : Next.js 16 (App Router, React 19, TypeScript, Tailwind 4) · Node.js / Express 5 · Socket.io · PostgreSQL · Redis

## Fonctionnalités

- Tableaux, listes et cartes en glisser-déposer (listes et cartes)
- Synchronisation temps réel de toutes les actions entre tous les membres
- Présence (avatars en ligne, nombre d'onglets), **curseurs en direct**, indicateur « X édite cette carte »
- Chat par tableau avec indicateur de saisie
- Invitation par lien, authentification JWT
- Gestion des conflits d'édition dans l'UI (« prendre leur version » / « écraser avec la mienne »)
- Reconnexion automatique avec resynchronisation complète

## Ce que le projet démontre

| Problème | Solution mise en place | Où |
|---|---|---|
| **Plusieurs instances API** | Adapter Redis pour Socket.io (pub/sub) : un événement émis sur l'instance A atteint les clients connectés à B. Présence calculée via `fetchSockets()` sur tout le cluster. Transport WebSocket seul, donc pas besoin de sessions collantes. | `apps/api/src/index.ts`, `realtime/socket.ts` |
| **Éditions concurrentes** | Verrouillage optimiste : `UPDATE … WHERE version = $v`. Le perdant reçoit `CONFLICT` avec l'état courant et le client propose de fusionner. | `boards/service.ts → updateCard` |
| **Déplacements concurrents** | Indexation fractionnaire (une seule ligne réécrite par déplacement) + verrou de ligne `SELECT … FOR UPDATE` sur la liste cible, qui sérialise les insertions au même endroit. Ordre de verrouillage fixe (carte → liste) pour éviter les deadlocks, et retry automatique sur `40001`/`40P01`. | `service.ts → moveCard`, `db/pool.ts` |
| **Précision des flottants** | Quand l'écart entre deux voisins devient inférieur à 1e-6, la liste est renumérotée dans la même transaction et un événement `cards:rebalanced` est diffusé. | `service.ts → placeItem` |
| **Cache cohérent** | Cache-aside des snapshots dans Redis, indexé par **numéro de révision**. Chaque écriture fait un `INCR` de la révision après le commit, donc un lecteur concurrent ne peut jamais enregistrer un état périmé sous la révision la plus récente. | `service.ts → getSnapshot` |
| **Pas d'événement perdu au join** | Le serveur rejoint la room *avant* de lire le snapshot, et le client met en file les événements reçus jusqu'à l'ack puis les rejoue. Les réducteurs sont idempotents (remplacement par id). | `realtime/socket.ts`, `web/src/lib/session.ts` |
| **UI optimiste** | Les déplacements s'appliquent tout de suite en local. Tant qu'un déplacement est en vol, les événements entrants pour cet élément mettent à jour le contenu mais gardent le placement local, puis l'ack applique la position décidée par le serveur. En cas d'échec, resynchronisation complète. | `web/src/lib/session.ts` |
| **Abus** | Limitation de débit en fenêtre fixe dans Redis (`MULTI INCR/EXPIRE`), partagée entre les instances : chat et authentification. Curseurs limités côté client (≈ 25/s) et côté serveur, envoyés en `volatile`. | `lib/rateLimit.ts` |

## Architecture

```
apps/
  api/      Express + Socket.io (TypeScript, ESM)
    src/boards/service.ts   logique métier, transactions, cache
    src/realtime/socket.ts  handlers Socket.io typés + validation zod
    scripts/concurrency.ts  test end-to-end multi-instances
  web/      Next.js 16 — store zustand normalisé, @hello-pangea/dnd
packages/
  shared/   types des événements client ↔ serveur + algorithme d'ordonnancement
```

Le contrat Socket.io (`packages/shared/src/events.ts`) est typé de bout en bout : le client et le serveur partagent les mêmes signatures d'événements et d'acks.

## Démarrage

Prérequis : Node.js ≥ 22, Docker.

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run infra:up        # PostgreSQL (5433) + Redis (6380)
npm run dev             # API sur :4000 (migrations auto) + web sur :3000
```

Ouvre http://localhost:3000 dans deux navigateurs (ou une fenêtre privée), crée deux comptes, puis partage le lien « Inviter ».

### Tester le scale horizontal

```bash
# 2e instance de l'API sur un autre port
PORT=4001 INSTANCE_ID=api-b npm run dev -w api

# Test de concurrence : clients répartis sur les deux instances
API_URLS=http://localhost:4000,http://localhost:4001 npm run demo:concurrency -w api
```

Sortie attendue :

```
1. Presence across instances            ✔ Alice sees Bob online
2. Cross-instance broadcast             ✔ Bob received Alice's card in 14.1 ms
3. Optimistic locking                   ✔ exactly one edit wins / the other gets CONFLICT
4. Concurrent moves into the same slot  ✔ every card has a distinct position (no collisions)
5. Rebalancing                          ✔ list was rebalanced and the event reached the other instance
6. Snapshot cache                       ✔ cached snapshot reflects latest edit
```

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | API + web en mode watch |
| `npm run build` | Bundle API (tsup) + build Next.js |
| `npm test` | Tests unitaires (vitest) |
| `npm run typecheck` | TypeScript sur tous les workspaces |
| `npm run db:migrate` | Applique les migrations (aussi lancées au démarrage de l'API, protégées par un advisory lock) |
