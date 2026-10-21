import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { AuthResponse } from "@synkro/shared";
import { currentUser, login, register, requireAuth, signToken } from "./auth/auth";
import * as boards from "./boards/service";
import { AppError, toAppError } from "./lib/errors";
import { rateLimit } from "./lib/rateLimit";
import { getIo } from "./realtime/io";

const credentials = z.object({
  email: z.email().max(200),
  password: z.string().min(6).max(200),
});
const registration = credentials.extend({ name: z.string().trim().min(1).max(50) });
const boardInput = z.object({ title: z.string().trim().min(1).max(100) });

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.post("/auth/register", async (req, res) => {
  await rateLimit(`auth:${req.ip}`, 20, 60);
  const { email, name, password } = registration.parse(req.body);
  const user = await register(email, name, password);
  res.status(201).json({ token: signToken(user.id), user } satisfies AuthResponse);
});

router.post("/auth/login", async (req, res) => {
  await rateLimit(`auth:${req.ip}`, 20, 60);
  const { email, password } = credentials.parse(req.body);
  const user = await login(email, password);
  res.json({ token: signToken(user.id), user } satisfies AuthResponse);
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json(currentUser(req));
});

router.get("/boards", requireAuth, async (req, res) => {
  res.json(await boards.listBoards(currentUser(req).id));
});

router.post("/boards", requireAuth, async (req, res) => {
  const { title } = boardInput.parse(req.body);
  res.status(201).json(await boards.createBoard(currentUser(req).id, title));
});

router.post("/boards/join/:code", requireAuth, async (req, res) => {
  const user = currentUser(req);
  const { board, joined } = await boards.joinByInvite(user.id, String(req.params.code));
  if (joined) getIo().to(`board:${board.id}`).emit("member:joined", { id: user.id, name: user.name, color: user.color });
  res.json(board);
});

router.get("/boards/:id", requireAuth, async (req, res) => {
  const boardId = z.uuid().parse(req.params.id);
  await boards.getRole(boardId, currentUser(req).id);
  res.json(await boards.getSnapshot(boardId));
});

router.delete("/boards/:id", requireAuth, async (req, res) => {
  const boardId = z.uuid().parse(req.params.id);
  await boards.deleteBoard(boardId, currentUser(req).id);
  getIo().to(`board:${boardId}`).emit("board:deleted");
  res.status(204).end();
});

router.get("/boards/:id/messages", requireAuth, async (req, res) => {
  const boardId = z.uuid().parse(req.params.id);
  const before = z.iso.datetime().optional().parse(req.query.before);
  await boards.getRole(boardId, currentUser(req).id);
  res.json(await boards.listMessages(boardId, 50, before));
});

router.use((_req, _res, next) => next(new AppError("NOT_FOUND", "Route not found")));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = toAppError(err);
  res.status(e.status).json({ error: e.message, code: e.code });
});
