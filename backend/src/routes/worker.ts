import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../lib/httpError.js";
import { processOutboxBatch } from "../worker/outboxWorker.js";

export const workerRouter = Router();

workerRouter.post(
  "/process",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await processOutboxBatch();
    res.json(result);
  }),
);
