import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { itemsRouter } from "./routes/items.js";
import { workerRouter } from "./routes/worker.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/items", itemsRouter);
  app.use("/api/worker", workerRouter);

  app.use(errorHandler);
  return app;
}

export const app = createApp();
