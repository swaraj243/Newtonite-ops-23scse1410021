import { OutboxJobStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { processOutboxBatch } from "./outboxWorker.js";

describe("outbox worker", () => {
  it("marks PENDING jobs COMPLETED", async () => {
    const job = await prisma.outboxJob.create({
      data: {
        eventType: "TEST_COMPLETED",
        payload: { ok: true },
        status: OutboxJobStatus.PENDING,
        nextRunAt: new Date(Date.now() - 1000),
      },
    });

    const result = await processOutboxBatch(50);
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const updated = await prisma.outboxJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.status).toBe(OutboxJobStatus.COMPLETED);
  });

  it("increments attempts and marks FAILED after maxAttempts", async () => {
    const job = await prisma.outboxJob.create({
      data: {
        eventType: "TEST_FAIL",
        payload: { forceFail: true },
        status: OutboxJobStatus.PENDING,
        maxAttempts: 1,
        nextRunAt: new Date(Date.now() - 1000),
      },
    });

    const result = await processOutboxBatch(50);
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const updated = await prisma.outboxJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.status).toBe(OutboxJobStatus.FAILED);
    expect(updated.attempts).toBeGreaterThanOrEqual(1);
    expect(updated.lastError).toContain("Forced outbox failure");
  });
});
