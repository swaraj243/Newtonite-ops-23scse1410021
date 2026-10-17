import { OutboxJobStatus, type OutboxJob } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const DEFAULT_BATCH_SIZE = 25;

function backoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(attempts, 1));
}

async function handleJobPayload(job: OutboxJob): Promise<void> {
  const payload = job.payload as { forceFail?: boolean };
  if (payload?.forceFail) {
    throw new Error("Forced outbox failure");
  }
  // Side effects (notifications, webhooks) would run here in production.
}

export async function processOutboxBatch(
  limit = DEFAULT_BATCH_SIZE,
): Promise<{ processed: number; completed: number; failed: number }> {
  const now = new Date();
  const jobs = await prisma.outboxJob.findMany({
    where: {
      status: OutboxJobStatus.PENDING,
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });

  let completed = 0;
  let failed = 0;
  let processed = 0;

  for (const job of jobs) {
    const claimed = await prisma.outboxJob.updateMany({
      where: { id: job.id, status: OutboxJobStatus.PENDING },
      data: { status: OutboxJobStatus.PROCESSING, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    processed += 1;

    try {
      await handleJobPayload(job);
      await prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: OutboxJobStatus.COMPLETED,
          lastError: null,
        },
      });
      completed += 1;
    } catch (err) {
      const attempts = job.attempts + 1;
      const exhausted = attempts >= job.maxAttempts;
      await prisma.outboxJob.update({
        where: { id: job.id },
        data: {
          status: exhausted
            ? OutboxJobStatus.FAILED
            : OutboxJobStatus.PENDING,
          lastError: err instanceof Error ? err.message : String(err),
          nextRunAt: new Date(Date.now() + backoffMs(attempts)),
        },
      });
      if (exhausted) failed += 1;
    }
  }

  return { processed, completed, failed };
}

let poller: ReturnType<typeof setInterval> | undefined;

export function startOutboxPoller(intervalMs = 5000): void {
  if (poller) return;
  poller = setInterval(() => {
    processOutboxBatch().catch((err) => {
      console.error("Outbox worker error", err);
    });
  }, intervalMs);
}

export function stopOutboxPoller(): void {
  if (poller) {
    clearInterval(poller);
    poller = undefined;
  }
}
