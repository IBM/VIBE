import type { ErrorRequestHandler } from "express";

interface HttpError extends Error {
  statusCode?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = (err as HttpError).statusCode ?? 500;
  const message =
    status === 500 ? "Internal server error" : (err as HttpError).message;

  if (status === 500) {
    console.error("[error]", err);
  }

  res.status(status).json({ error: message });
};
