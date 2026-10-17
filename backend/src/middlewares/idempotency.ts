import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Replays a stored POST /api/items response when Idempotency-Key is reused
 * by the same user. Persistence of new keys happens inside the create transaction.
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const keyHeader = req.get("Idempotency-Key");
  if (!keyHeader) {
    next();
    return;
  }

  const key = keyHeader.trim();
  if (!key) {
    next();
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.idempotencyKey = key;

  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (!existing) {
    next();
    return;
  }

  if (existing.userId !== req.user.id) {
    res.status(409).json({ error: "Idempotency key already used by another user" });
    return;
  }

  res.status(existing.statusCode).json(existing.responseBody as Prisma.JsonValue);
}
