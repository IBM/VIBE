import { Router, type Request, type Response, type NextFunction } from "express";
import { runBob, runBobStreaming } from "../services/bob.service";
import { resolveConversation } from "../services/session.service";
import { removeWorktree, listWorktrees } from "../services/worktree.service";
import type { ChatRequest } from "../types/bob.types";

export const chatRouter = Router();

// ─── POST /api/v1/chat ───────────────────────────────────────────────────────

chatRouter.post(
  "/chat",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ChatRequest;

      if (!body.message || typeof body.message !== "string") {
        res.status(400).json({ error: "message is required and must be a string" });
        return;
      }

      const meta = await resolveConversation(body.conversationId, body.mode);

      const wantsStream =
        req.headers.accept?.includes("text/event-stream") ?? false;

      if (wantsStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        await runBobStreaming(
          meta.conversationId,
          meta.sessionId,
          body.message,
          res,
          meta.mode
        );

        res.end();
        return;
      }

      const result = await runBob(
        meta.conversationId,
        meta.sessionId,
        body.message,
        meta.mode
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/conversations ───────────────────────────────────────────────

chatRouter.get(
  "/conversations",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const conversations = await listWorktrees();
      res.json({ conversations });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/v1/conversations/:id ───────────────────────────────────────

chatRouter.delete(
  "/conversations/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      await removeWorktree(id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);
