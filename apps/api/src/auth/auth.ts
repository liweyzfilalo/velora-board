import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { User } from "@synkro/shared";
import { config } from "../config";
import { pool } from "../db/pool";
import { AppError } from "../lib/errors";

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];

interface UserRow {
  id: string;
  email: string;
  name: string;
  color: string;
  password_hash: string;
}

const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, name: r.name, color: r.color });

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): string {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === "string" || !payload.sub) throw new Error("bad payload");
    return payload.sub;
  } catch {
    throw new AppError("UNAUTHORIZED", "Invalid or expired token");
  }
}

export async function register(email: string, name: string, password: string): Promise<User> {
  const hash = await bcrypt.hash(password, 10);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
  try {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (email, name, color, password_hash) VALUES (lower($1), $2, $3, $4) RETURNING *`,
      [email, name, color, hash],
    );
    return toUser(rows[0]!);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new AppError("CONFLICT", "Email already registered");
    throw err;
  }
}

export async function login(email: string, password: string): Promise<User> {
  const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE email = lower($1)`, [email]);
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password");
  }
  return toUser(row);
}

export async function getUser(id: string): Promise<User> {
  const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!rows[0]) throw new AppError("UNAUTHORIZED", "User no longer exists");
  return toUser(rows[0]);
}

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError("UNAUTHORIZED", "Missing bearer token");
  req.user = await getUser(verifyToken(header.slice(7)));
  next();
}

export function currentUser(req: Request): User {
  if (!req.user) throw new AppError("UNAUTHORIZED", "Not authenticated");
  return req.user;
}
