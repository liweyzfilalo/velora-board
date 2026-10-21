/**
 * End-to-end concurrency check against running API instances.
 *
 *   npm run demo:concurrency -w api                       # one instance (4000)
 *   API_URLS=http://localhost:4000,http://localhost:4001 npm run demo:concurrency -w api
 *
 * With two URLs, clients are spread across both instances to prove that the
 * Redis adapter fans events out between nodes.
 */
import { io, type Socket } from "socket.io-client";
import type {
  Ack,
  AuthResponse,
  Board,
  Card,
  ClientToServerEvents,
  JoinResult,
  PresenceUser,
  ServerToClientEvents,
} from "@synkro/shared";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const urls = (process.env.API_URLS ?? "http://localhost:4000").split(",");
const run = Date.now().toString(36);
let failures = 0;

function check(cond: boolean, label: string): void {
  console.log(`${cond ? "  ✔" : "  ✘"} ${label}`);
  if (!cond) failures++;
}

async function http<T>(base: string, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await fetch(base + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body as T;
}

async function user(name: string): Promise<AuthResponse> {
  return http(urls[0]!, "/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `${name}-${run}@test.dev`, name, password: "password123" }),
  });
}

function connect(url: string, token: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const s: Client = io(url, { auth: { token }, transports: ["websocket"] });
    s.once("connect", () => resolve(s));
    s.once("connect_error", reject);
  });
}

function emit<T>(s: Client, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => (s.emit as any)(event, payload, resolve));
}

async function ok<T>(p: Promise<Ack<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
  return r.data;
}

function waitFor<E extends keyof ServerToClientEvents>(
  s: Client,
  event: E,
  pred: (...args: Parameters<ServerToClientEvents[E]>) => boolean = () => true,
  ms = 3000,
): Promise<Parameters<ServerToClientEvents[E]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    const handler = (...args: any[]) => {
      if (!(pred as any)(...args)) return;
      clearTimeout(timer);
      (s.off as any)(event, handler);
      resolve(args as any);
    };
    (s.on as any)(event, handler);
  });
}

async function main(): Promise<void> {
  console.log(`Instances: ${urls.join(", ")}`);
  const [alice, bob] = await Promise.all([user("alice"), user("bob")]);
  const board = await http<Board>(urls[0]!, "/boards", {
    method: "POST",
    token: alice.token,
    body: JSON.stringify({ title: `Concurrency ${run}` }),
  });
  await http(urls.at(-1)!, `/boards/join/${board.inviteCode}`, { method: "POST", token: bob.token });

  const a = await connect(urls[0]!, alice.token);
  const b = await connect(urls.at(-1)!, bob.token);
  const joinA = await ok(emit<JoinResult>(a, "board:join", { boardId: board.id }));
  const bobSeen = waitFor(a, "presence:update", (users: PresenceUser[]) => users.length === 2);
  await ok(emit<JoinResult>(b, "board:join", { boardId: board.id }));

  console.log("\n1. Presence across instances");
  check((await bobSeen)[0].some((u) => u.id === bob.user.id), "Alice sees Bob online");

  console.log("\n2. Cross-instance broadcast");
  const todo = joinA.snapshot.lists[0]!;
  const seenByBob = waitFor(b, "card:upserted", (c: Card) => c.title === "Hello");
  const t0 = performance.now();
  const card = await ok(emit<Card>(a, "card:create", { listId: todo.id, title: "Hello" }));
  await seenByBob;
  check(true, `Bob received Alice's card in ${(performance.now() - t0).toFixed(1)} ms`);

  console.log("\n3. Optimistic locking on concurrent edits");
  const [ra, rb] = await Promise.all([
    emit<Card>(a, "card:update", { id: card.id, version: card.version, title: "Alice's title" }),
    emit<Card>(b, "card:update", { id: card.id, version: card.version, title: "Bob's title" }),
  ]);
  const results = [ra, rb];
  const winners = results.filter((r) => r.ok);
  const conflict = results.find((r) => !r.ok);
  check(winners.length === 1, "exactly one edit wins");
  check(!!conflict && !conflict.ok && conflict.code === "CONFLICT", "the other gets CONFLICT");
  check(
    !!conflict && !conflict.ok && (conflict.current as Card | undefined)?.version === card.version + 1,
    "CONFLICT carries the current server version for reconciliation",
  );

  console.log("\n4. Concurrent moves into the same slot");
  const doing = joinA.snapshot.lists[1]!;
  const created = await Promise.all(
    Array.from({ length: 20 }, (_, i) => ok(emit<Card>(i % 2 ? b : a, "card:create", { listId: todo.id, title: `c${i}` }))),
  );
  await Promise.all(created.map((c, i) => ok(emit<Card>(i % 2 ? b : a, "card:move", { id: c.id, toListId: doing.id, toIndex: 0 }))));
  const after = await http<{ cards: Card[] }>(urls[0]!, `/boards/${board.id}`, { token: alice.token });
  const moved = after.cards.filter((c) => c.listId === doing.id);
  check(moved.length === 20, "all 20 cards landed in the target list");
  check(new Set(moved.map((c) => c.position)).size === 20, "every card has a distinct position (no collisions)");

  console.log("\n5. Rebalancing when float gaps run out");
  const target = moved.sort((x, y) => x.position - y.position);
  let rebalanced = false;
  b.on("cards:rebalanced", () => (rebalanced = true));
  // Repeatedly insert between the first two cards to exhaust the gap.
  for (let i = 0; i < 60 && !rebalanced; i++) {
    await ok(emit<Card>(a, "card:move", { id: target[2 + (i % 10)]!.id, toListId: doing.id, toIndex: 1 }));
  }
  await new Promise((r) => setTimeout(r, 200));
  check(rebalanced, "list was rebalanced and the event reached the other instance");
  const final = await http<{ cards: Card[] }>(urls[0]!, `/boards/${board.id}`, { token: alice.token });
  const positions = final.cards.filter((c) => c.listId === doing.id).map((c) => c.position);
  check(new Set(positions).size === positions.length, "positions are still unique after rebalancing");

  console.log("\n6. Snapshot cache stays consistent with writes");
  check(final.cards.some((c) => c.id === card.id && c.version === card.version + 1), "cached snapshot reflects latest edit");

  a.close();
  b.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
