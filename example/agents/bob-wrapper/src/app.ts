import express from "express";
import { chatRouter } from "./routes/chat";
import { errorHandler } from "./middleware/error";

const app = express();

app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ─── API routes ───────────────────────────────────────────────────────────

app.use("/api/v1", chatRouter);

// ─── Centralised error handler (must be last) ─────────────────────────────

app.use(errorHandler);

export default app;
