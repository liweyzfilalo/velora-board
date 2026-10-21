import { randomBytes } from "node:crypto";
import {
  POSITION_STEP,
  needsRebalance,
  positionAtIndex,
  rebalancedPositions,
  type Board,
  type BoardRole,
  type BoardSnapshot,
  type BoardSummary,
  type Card,
  type ChatMessage,
  type List,
  type PublicUser,
} from "@velora/shared";
import type pg from "pg";
import { config } from "../config";
import { pool, withTransaction, type Db } from "../db/pool";
import { AppError } from "../lib/errors";
import { redis } from "../redis";

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

const BOARD_COLS = `b.id, b.title, b.owner_id, b.invite_code, b.created_at`;
const CARD_COLS = `id, board_id, list_id, title, description, position, version, updated_at, updated_by`;
const LIST_COLS = `id, board_id, title, position, version`;

type Row = Record<string, any>;

const toBoard = (r: Row): Board => ({
  id: r.id,
  title: r.title,
  ownerId: r.owner_id,
  inviteCode: r.invite_code,
  createdAt: new Date(r.created_at).toISOString(),
});

const toList = (r: Row): List => ({
  id: r.id,
  boardId: r.board_id,
  title: r.title,
  position: r.position,
  version: r.version,
});

const toCard = (r: Row): Card => ({
  id: r.id,
  boardId: r.board_id,
  listId: r.list_id,
  title: r.title,
  description: r.description,
  position: r.position,
  version: r.version,
  updatedAt: new Date(r.updated_at).toISOString(),
  updatedBy: r.updated_by,
});

const toMessage = (r: Row): ChatMessage => ({
  id: r.id,
  boardId: r.board_id,
  content: r.content,
  createdAt: new Date(r.created_at).toISOString(),
  user: { id: r.user_id, name: r.user_name, color: r.user_color },
});

// ---------------------------------------------------------------------------
// Snapshot cache (cache-aside, revision-keyed)
//
// Every write bumps `board:{id}:rev` *after* committing. Readers read the
// revision first and cache under `snap:{rev}`, so a reader racing a writer
// can never store stale data under the newest revision.
// ---------------------------------------------------------------------------

const revKey = (boardId: string) => `board:${boardId}:rev`;
const snapKey = (boardId: string, rev: string) => `board:${boardId}:snap:${rev}`;

export async function invalidateBoard(boardId: string): Promise<void> {
  await redis?.incr(revKey(boardId));
}

export async function getSnapshot(boardId: string): Promise<BoardSnapshot> {
  if (!redis) return loadSnapshot(boardId);
  const rev = (await redis.get(revKey(boardId))) ?? "0";
  const cached = await redis.get(snapKey(boardId, rev));
  if (cached) return JSON.parse(cached) as BoardSnapshot;

  const snapshot = await loadSnapshot(boardId);
  await redis.set(snapKey(boardId, rev), JSON.stringify(snapshot), "EX", config.snapshotTtlSeconds);
  return snapshot;
}

async function loadSnapshot(boardId: string): Promise<BoardSnapshot> {
  const [board, lists, cards, members] = await Promise.all([
    pool.query(`SELECT ${BOARD_COLS} FROM boards b WHERE b.id = $1`, [boardId]),
    pool.query(`SELECT ${LIST_COLS} FROM lists WHERE board_id = $1 ORDER BY position`, [boardId]),
    pool.query(`SELECT ${CARD_COLS} FROM cards WHERE board_id = $1 ORDER BY list_id, position`, [boardId]),
    pool.query(
      `SELECT u.id, u.name, u.color FROM board_members m JOIN users u ON u.id = m.user_id
       WHERE m.board_id = $1 ORDER BY m.joined_at`,
      [boardId],
    ),
  ]);
  if (!board.rows[0]) throw new AppError("NOT_FOUND", "Board not found");
  return {
    board: toBoard(board.rows[0]),
    lists: lists.rows.map(toList),
    cards: cards.rows.map(toCard),
    members: members.rows as PublicUser[],
  };
}

// ---------------------------------------------------------------------------
// Boards & membership
// ---------------------------------------------------------------------------

export async function getRole(boardId: string, userId: string): Promise<BoardRole> {
  const { rows } = await pool.query(`SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2`, [
    boardId,
    userId,
  ]);
  if (!rows[0]) throw new AppError("FORBIDDEN", "You are not a member of this board");
  return rows[0].role;
}

export async function listBoards(userId: string): Promise<BoardSummary[]> {
  const { rows } = await pool.query(
    `SELECT ${BOARD_COLS}, m.role,
            (SELECT count(*)::int FROM board_members WHERE board_id = b.id) AS member_count,
            (SELECT count(*)::int FROM cards WHERE board_id = b.id) AS card_count
       FROM board_members m JOIN boards b ON b.id = m.board_id
      WHERE m.user_id = $1
      ORDER BY b.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({ ...toBoard(r), role: r.role, memberCount: r.member_count, cardCount: r.card_count }));
}

const DEFAULT_LISTS = ["À faire", "En cours", "Terminé"];

export async function createBoard(userId: string, title: string): Promise<Board> {
  return withTransaction(async (c) => {
    const inviteCode = randomBytes(6).toString("base64url");
    const { rows } = await c.query(
      `INSERT INTO boards (title, owner_id, invite_code) VALUES ($1, $2, $3)
       RETURNING id, title, owner_id, invite_code, created_at`,
      [title, userId, inviteCode],
    );
    const board = toBoard(rows[0]!);
    await c.query(`INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')`, [board.id, userId]);
    for (const [i, name] of DEFAULT_LISTS.entries()) {
      await c.query(`INSERT INTO lists (board_id, title, position) VALUES ($1, $2, $3)`, [
        board.id,
        name,
        (i + 1) * POSITION_STEP,
      ]);
    }
    return board;
  });
}

export async function joinByInvite(userId: string, inviteCode: string): Promise<{ board: Board; joined: boolean }> {
  const { rows } = await pool.query(`SELECT ${BOARD_COLS} FROM boards b WHERE b.invite_code = $1`, [inviteCode]);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Invalid invite code");
  const board = toBoard(rows[0]);
  const res = await pool.query(
    `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
    [board.id, userId],
  );
  const joined = (res.rowCount ?? 0) > 0;
  if (joined) await invalidateBoard(board.id);
  return { board, joined };
}

export async function renameBoard(boardId: string, title: string): Promise<Board> {
  const { rows } = await pool.query(
    `UPDATE boards b SET title = $2 WHERE id = $1 RETURNING ${BOARD_COLS}`,
    [boardId, title],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "Board not found");
  await invalidateBoard(boardId);
  return toBoard(rows[0]);
}

export async function deleteBoard(boardId: string, userId: string): Promise<void> {
  if ((await getRole(boardId, userId)) !== "owner") throw new AppError("FORBIDDEN", "Only the owner can delete");
  await pool.query(`DELETE FROM boards WHERE id = $1`, [boardId]);
  await invalidateBoard(boardId);
}

// ---------------------------------------------------------------------------
// Lists
//
// List ordering is serialised per board by locking the board row.
// ---------------------------------------------------------------------------

async function lockBoard(c: pg.PoolClient, boardId: string): Promise<void> {
  const { rowCount } = await c.query(`SELECT 1 FROM boards WHERE id = $1 FOR UPDATE`, [boardId]);
  if (!rowCount) throw new AppError("NOT_FOUND", "Board not found");
}

export async function createList(boardId: string, title: string): Promise<List> {
  const list = await withTransaction(async (c) => {
    await lockBoard(c, boardId);
    const { rows } = await c.query(
      `INSERT INTO lists (board_id, title, position)
       VALUES ($1, $2, COALESCE((SELECT max(position) FROM lists WHERE board_id = $1), 0) + $3)
       RETURNING ${LIST_COLS}`,
      [boardId, title, POSITION_STEP],
    );
    return toList(rows[0]!);
  });
  await invalidateBoard(boardId);
  return list;
}

export async function updateList(boardId: string, id: string, title: string): Promise<List> {
  const { rows } = await pool.query(
    `UPDATE lists SET title = $3, version = version + 1 WHERE id = $1 AND board_id = $2 RETURNING ${LIST_COLS}`,
    [id, boardId, title],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "List not found");
  await invalidateBoard(boardId);
  return toList(rows[0]);
}

export async function deleteList(boardId: string, id: string): Promise<void> {
  const { rowCount } = await pool.query(`DELETE FROM lists WHERE id = $1 AND board_id = $2`, [id, boardId]);
  if (!rowCount) throw new AppError("NOT_FOUND", "List not found");
  await invalidateBoard(boardId);
}

export async function moveList(
  boardId: string,
  id: string,
  toIndex: number,
): Promise<{ list: List; rebalanced?: Record<string, number> }> {
  const result = await withTransaction(async (c) => {
    await lockBoard(c, boardId);
    const { rows } = await c.query(`SELECT ${LIST_COLS} FROM lists WHERE board_id = $1 ORDER BY position, id`, [
      boardId,
    ]);
    const all = rows.map(toList);
    const moving = all.find((l) => l.id === id);
    if (!moving) throw new AppError("NOT_FOUND", "List not found");
    const siblings = all.filter((l) => l.id !== id);
    const { position, rebalanced } = await placeItem(c, "lists", siblings, moving, toIndex);
    const { rows: updated } = await c.query(`UPDATE lists SET position = $2 WHERE id = $1 RETURNING ${LIST_COLS}`, [
      id,
      position,
    ]);
    return { list: toList(updated[0]!), rebalanced };
  });
  await invalidateBoard(boardId);
  return result;
}

// ---------------------------------------------------------------------------
// Cards
//
// Ordering inside a list is serialised by locking the target list row, so two
// users dropping cards into the same slot get distinct positions. Content
// edits use optimistic locking on `version` instead (no lock held while a
// user is typing): a stale version yields a CONFLICT carrying the current card.
// ---------------------------------------------------------------------------

async function lockList(c: pg.PoolClient, boardId: string, listId: string): Promise<void> {
  const { rowCount } = await c.query(`SELECT 1 FROM lists WHERE id = $1 AND board_id = $2 FOR UPDATE`, [
    listId,
    boardId,
  ]);
  if (!rowCount) throw new AppError("NOT_FOUND", "List not found");
}

export async function createCard(boardId: string, listId: string, title: string, userId: string): Promise<Card> {
  const card = await withTransaction(async (c) => {
    await lockList(c, boardId, listId);
    const { rows } = await c.query(
      `INSERT INTO cards (board_id, list_id, title, position, updated_by)
       VALUES ($1, $2, $3, COALESCE((SELECT max(position) FROM cards WHERE list_id = $2), 0) + $4, $5)
       RETURNING ${CARD_COLS}`,
      [boardId, listId, title, POSITION_STEP, userId],
    );
    return toCard(rows[0]!);
  });
  await invalidateBoard(boardId);
  return card;
}

async function findCard(db: Db, boardId: string, id: string, lock = false): Promise<Card> {
  const { rows } = await db.query(
    `SELECT ${CARD_COLS} FROM cards WHERE id = $1 AND board_id = $2 ${lock ? "FOR UPDATE" : ""}`,
    [id, boardId],
  );
  if (!rows[0]) throw new AppError("NOT_FOUND", "Card not found (it may have been deleted)");
  return toCard(rows[0]);
}

export async function updateCard(
  boardId: string,
  id: string,
  expectedVersion: number,
  patch: { title?: string; description?: string },
  userId: string,
): Promise<Card> {
  const { rows } = await pool.query(
    `UPDATE cards
        SET title = COALESCE($4, title),
            description = COALESCE($5, description),
            version = version + 1,
            updated_at = now(),
            updated_by = $6
      WHERE id = $1 AND board_id = $2 AND version = $3
      RETURNING ${CARD_COLS}`,
    [id, boardId, expectedVersion, patch.title ?? null, patch.description ?? null, userId],
  );
  if (!rows[0]) {
    const current = await findCard(pool, boardId, id); // throws NOT_FOUND if deleted
    throw new AppError("CONFLICT", "This card was modified by someone else in the meantime", current);
  }
  await invalidateBoard(boardId);
  return toCard(rows[0]);
}

export async function deleteCard(boardId: string, id: string): Promise<void> {
  const { rowCount } = await pool.query(`DELETE FROM cards WHERE id = $1 AND board_id = $2`, [id, boardId]);
  if (!rowCount) throw new AppError("NOT_FOUND", "Card not found");
  await invalidateBoard(boardId);
}

export async function moveCard(
  boardId: string,
  id: string,
  toListId: string,
  toIndex: number,
): Promise<{ card: Card; rebalanced?: Record<string, number> }> {
  const result = await withTransaction(async (c) => {
    // Lock order: card row, then target list row. Never the reverse, so no deadlock cycle.
    const moving = await findCard(c, boardId, id, true);
    await lockList(c, boardId, toListId);
    const { rows } = await c.query(
      `SELECT ${CARD_COLS} FROM cards WHERE list_id = $1 AND id <> $2 ORDER BY position, id`,
      [toListId, id],
    );
    const siblings = rows.map(toCard);
    const { position, rebalanced } = await placeItem(c, "cards", siblings, moving, toIndex);
    const { rows: updated } = await c.query(
      `UPDATE cards SET list_id = $2, position = $3 WHERE id = $1 RETURNING ${CARD_COLS}`,
      [id, toListId, position],
    );
    return { card: toCard(updated[0]!), rebalanced };
  });
  await invalidateBoard(boardId);
  return result;
}

/**
 * Computes the new position of `moving` at `toIndex` among `siblings` (the
 * caller persists it). If the gap between neighbours is exhausted, renumbers
 * the siblings and returns the new positions so clients can apply them.
 */
async function placeItem<T extends { id: string; position: number }>(
  c: pg.PoolClient,
  table: "lists" | "cards",
  siblings: T[],
  moving: T,
  toIndex: number,
): Promise<{ position: number; rebalanced?: Record<string, number> }> {
  const i = Math.max(0, Math.min(toIndex, siblings.length));
  const prev = siblings[i - 1]?.position;
  const next = siblings[i]?.position;
  if (!needsRebalance(prev, next)) return { position: positionAtIndex(siblings, i) };

  const ordered = [...siblings];
  ordered.splice(i, 0, moving);
  const positions = rebalancedPositions(ordered);
  const ids = Object.keys(positions);
  await c.query(
    `UPDATE ${table} t SET position = v.position
       FROM unnest($1::uuid[], $2::float8[]) AS v(id, position)
      WHERE t.id = v.id`,
    [ids, ids.map((k) => positions[k])],
  );
  return { position: positions[moving.id]!, rebalanced: positions };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function listMessages(boardId: string, limit = 50, before?: string): Promise<ChatMessage[]> {
  const { rows } = await pool.query(
    `SELECT m.id, m.board_id, m.content, m.created_at, m.user_id, u.name AS user_name, u.color AS user_color
       FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.board_id = $1 AND ($3::timestamptz IS NULL OR m.created_at < $3)
      ORDER BY m.created_at DESC
      LIMIT $2`,
    [boardId, limit, before ?? null],
  );
  return rows.map(toMessage).reverse();
}

export async function createMessage(boardId: string, user: PublicUser, content: string): Promise<ChatMessage> {
  const { rows } = await pool.query(
    `INSERT INTO messages (board_id, user_id, content) VALUES ($1, $2, $3) RETURNING id, board_id, content, created_at`,
    [boardId, user.id, content],
  );
  return toMessage({ ...rows[0], user_id: user.id, user_name: user.name, user_color: user.color });
}
