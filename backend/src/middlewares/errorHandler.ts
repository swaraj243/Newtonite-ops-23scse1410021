import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...err.body,
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
