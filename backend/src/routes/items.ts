import { Router } from "express";
import {
  Prisma,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/httpError.js";
import { requireAuth } from "../middlewares/auth.js";
import { idempotencyMiddleware } from "../middlewares/idempotency.js";
import type { AuthUser } from "../lib/authUser.js";
import {
  accessibleTeamIds,
  assertPermission,
  assertTeamAccess,
  transitionRejection,
} from "../services/workflowAndPermissions.js";

export const itemsRouter = Router();

itemsRouter.use(requireAuth);

const WORK_ITEM_TYPES = new Set<string>(Object.values(WorkItemType));
const WORK_ITEM_PRIORITIES = new Set<string>(Object.values(WorkItemPriority));
const WORK_ITEM_STATUSES = new Set<string>(Object.values(WorkItemStatus));

const itemDetailInclude = {
  team: true,
  assignee: { select: { id: true, email: true, name: true } },
  createdBy: { select: { id: true, email: true, name: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, email: true, name: true } } },
  },
  activityEvents: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { id: true, email: true, name: true } } },
  },
};

const itemListInclude = {
  team: true,
  assignee: { select: { id: true, email: true, name: true } },
  createdBy: { select: { id: true, email: true, name: true } },
};

function parseEnum<T extends string>(
  value: unknown,
  allowed: Set<string>,
  label: string,
): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return value as T;
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep <= 0) throw new Error("bad cursor");
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) throw new Error("bad cursor");
    return { createdAt, id };
  } catch {
    throw new HttpError(400, "Invalid cursor");
  }
}

function teamScopeWhere(user: AuthUser): Prisma.WorkItemWhereInput {
  const teamIds = accessibleTeamIds(user);
  if (teamIds === null) return {};
  return { teamId: { in: teamIds } };
}

async function loadItemOrThrow(id: string) {
  const item = await prisma.workItem.findUnique({
    where: { id },
    include: itemDetailInclude,
  });
  if (!item) throw new HttpError(404, "Work item not found");
  return item;
}

async function conflictResponse(id: string): Promise<never> {
  const currentItem = await prisma.workItem.findUnique({
    where: { id },
    include: itemListInclude,
  });
  if (!currentItem) throw new HttpError(404, "Work item not found");
  throw new HttpError(409, "Conflict", { currentItem });
}

function enqueueOutbox(
  tx: Prisma.TransactionClient,
  eventType: string,
  payload: Prisma.InputJsonValue,
) {
  return tx.outboxJob.create({
    data: { eventType, payload },
  });
}

itemsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const status = parseEnum<WorkItemStatus>(
      req.query.status,
      WORK_ITEM_STATUSES,
      "status",
    );
    const priority = parseEnum<WorkItemPriority>(
      req.query.priority,
      WORK_ITEM_PRIORITIES,
      "priority",
    );
    const type = parseEnum<WorkItemType>(req.query.type, WORK_ITEM_TYPES, "type");
    const teamId =
      typeof req.query.teamId === "string" ? req.query.teamId : undefined;
    const assigneeId =
      typeof req.query.assigneeId === "string" ? req.query.assigneeId : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const view =
      typeof req.query.view === "string" ? req.query.view : undefined;
    const limitRaw = Number(req.query.limit ?? 25);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(1, limitRaw), 100)
      : 25;
    const cursor =
      typeof req.query.cursor === "string" && req.query.cursor
        ? decodeCursor(req.query.cursor)
        : undefined;

    if (teamId) {
      assertTeamAccess(user, teamId);
    }

    const where: Prisma.WorkItemWhereInput = {
      AND: [
        teamScopeWhere(user),
        teamId ? { teamId } : {},
        status ? { status } : {},
        priority ? { priority } : {},
        type ? { type } : {},
        assigneeId ? { assigneeId } : {},
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        view === "assigned_to_me" ? { assigneeId: user.id } : {},
        view === "unassigned_urgent"
          ? { assigneeId: null, priority: WorkItemPriority.URGENT }
          : {},
        view === "awaiting_approval"
          ? { status: WorkItemStatus.AWAITING_APPROVAL }
          : {},
        cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {},
      ],
    };

    if (
      view &&
      !["assigned_to_me", "unassigned_urgent", "awaiting_approval"].includes(
        view,
      )
    ) {
      throw new HttpError(400, "Invalid view");
    }

    const [totalCount, rows] = await Promise.all([
      prisma.workItem.count({
        where: cursor
          ? { AND: (where.AND as Prisma.WorkItemWhereInput[]).slice(0, -1) }
          : where,
      }),
      prisma.workItem.findMany({
        where,
        include: itemListInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    res.json({
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      hasMore,
      totalCount,
    });
  }),
);

itemsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await loadItemOrThrow(req.params.id);
    assertTeamAccess(req.user!, item.teamId);
    res.json({ item });
  }),
);

itemsRouter.post(
  "/",
  idempotencyMiddleware,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const title =
      typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description =
      typeof req.body?.description === "string" ? req.body.description : "";
    const teamId =
      typeof req.body?.teamId === "string" ? req.body.teamId : "";
    const type = parseEnum<WorkItemType>(req.body?.type, WORK_ITEM_TYPES, "type");
    const priority = parseEnum<WorkItemPriority>(
      req.body?.priority,
      WORK_ITEM_PRIORITIES,
      "priority",
    );
    if (!title || !teamId || !type || !priority) {
      throw new HttpError(400, "title, teamId, type, and priority are required");
    }

    const role = assertTeamAccess(user, teamId);
    assertPermission(role, "work_item:create");

    let assigneeId: string | null = null;
    if (req.body?.assigneeId) {
      assertPermission(role, "work_item:assign");
      assigneeId = String(req.body.assigneeId);
    }

    const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      throw new HttpError(400, "Invalid dueDate");
    }

    const endpoint = "POST /api/items";

    try {
      const created = await prisma.$transaction(async (tx) => {
        if (req.idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              key: req.idempotencyKey,
              userId: user.id,
              endpoint,
              statusCode: 201,
              responseBody: {},
            },
          });
        }

        const item = await tx.workItem.create({
          data: {
            title,
            description,
            type,
            priority,
            status: WorkItemStatus.OPEN,
            teamId,
            assigneeId,
            createdById: user.id,
            dueDate,
          },
          include: itemListInclude,
        });

        await tx.activityEvent.create({
          data: {
            workItemId: item.id,
            actorId: user.id,
            eventType: "CREATED",
            newValue: {
              title,
              type,
              priority,
              status: item.status,
              teamId,
            },
          },
        });

        await enqueueOutbox(tx, "WORK_ITEM_CREATED", {
          workItemId: item.id,
          actorId: user.id,
          teamId,
        });

        const responseBody = { item };
        if (req.idempotencyKey) {
          await tx.idempotencyKey.update({
            where: { key: req.idempotencyKey },
            data: { responseBody },
          });
        }
        return responseBody;
      });

      res.status(201).json(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        req.idempotencyKey
      ) {
        const stored = await prisma.idempotencyKey.findUnique({
          where: { key: req.idempotencyKey },
        });
        if (stored && stored.userId === user.id) {
          res.status(stored.statusCode).json(stored.responseBody);
          return;
        }
      }
      throw err;
    }
  }),
);

itemsRouter.post(
  "/:id/claim",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const id = req.params.id;
    const existing = await prisma.workItem.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Work item not found");
    const role = assertTeamAccess(user, existing.teamId);
    assertPermission(role, "work_item:claim");

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.workItem.updateMany({
        where: { id, assigneeId: null, teamId: existing.teamId },
        data: {
          assigneeId: user.id,
          status: WorkItemStatus.IN_PROGRESS,
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) return null;

      const item = await tx.workItem.findUniqueOrThrow({
        where: { id },
        include: itemListInclude,
      });

      await tx.activityEvent.create({
        data: {
          workItemId: id,
          actorId: user.id,
          eventType: "CLAIMED",
          oldValue: {
            assigneeId: existing.assigneeId,
            status: existing.status,
          },
          newValue: { assigneeId: user.id, status: item.status },
        },
      });

      await enqueueOutbox(tx, "WORK_ITEM_CLAIMED", {
        workItemId: id,
        actorId: user.id,
      });

      return item;
    });

    if (!result) {
      await conflictResponse(id);
    }
    res.json({ item: result });
  }),
);

itemsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const id = req.params.id;
    const version = req.body?.version;
    if (typeof version !== "number" || !Number.isInteger(version)) {
      throw new HttpError(400, "version is required");
    }

    const existing = await prisma.workItem.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Work item not found");
    const role = assertTeamAccess(user, existing.teamId);
    assertPermission(role, "work_item:update");

    const data: Prisma.WorkItemUncheckedUpdateManyInput = {
      version: { increment: 1 },
    };
    const events: {
      eventType: string;
      oldValue: Prisma.InputJsonValue;
      newValue: Prisma.InputJsonValue;
    }[] = [];

    if (typeof req.body.title === "string") {
      data.title = req.body.title.trim();
      events.push({
        eventType: "EDITED",
        oldValue: { title: existing.title },
        newValue: { title: data.title },
      });
    }
    if (typeof req.body.description === "string") {
      data.description = req.body.description;
      events.push({
        eventType: "EDITED",
        oldValue: { description: existing.description },
        newValue: { description: data.description },
      });
    }
    if (req.body.type !== undefined) {
      data.type = parseEnum<WorkItemType>(req.body.type, WORK_ITEM_TYPES, "type");
      events.push({
        eventType: "EDITED",
        oldValue: { type: existing.type },
        newValue: { type: data.type as string },
      });
    }
    if (req.body.priority !== undefined) {
      assertPermission(role, "work_item:change_priority");
      data.priority = parseEnum<WorkItemPriority>(
        req.body.priority,
        WORK_ITEM_PRIORITIES,
        "priority",
      );
      events.push({
        eventType: "PRIORITY_CHANGED",
        oldValue: { priority: existing.priority },
        newValue: { priority: data.priority as string },
      });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "dueDate")) {
      const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        throw new HttpError(400, "Invalid dueDate");
      }
      data.dueDate = dueDate;
      events.push({
        eventType: "EDITED",
        oldValue: { dueDate: existing.dueDate?.toISOString() ?? null },
        newValue: { dueDate: dueDate?.toISOString() ?? null },
      });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "assigneeId")) {
      assertPermission(role, "work_item:assign");
      const assigneeId = req.body.assigneeId ? String(req.body.assigneeId) : null;
      data.assigneeId = assigneeId;
      events.push({
        eventType: "REASSIGNED",
        oldValue: { assigneeId: existing.assigneeId },
        newValue: { assigneeId },
      });
    }

    if (events.length === 0) {
      throw new HttpError(400, "No updatable fields provided");
    }

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.workItem.updateMany({
        where: { id, version },
        data,
      });
      if (updated.count === 0) return null;

      for (const event of events) {
        await tx.activityEvent.create({
          data: {
            workItemId: id,
            actorId: user.id,
            eventType: event.eventType,
            oldValue: event.oldValue,
            newValue: event.newValue,
          },
        });
      }

      await enqueueOutbox(tx, "WORK_ITEM_UPDATED", {
        workItemId: id,
        actorId: user.id,
        changes: events.map((e) => e.eventType),
      });

      return tx.workItem.findUniqueOrThrow({
        where: { id },
        include: itemListInclude,
      });
    });

    if (!item) await conflictResponse(id);
    res.json({ item });
  }),
);

itemsRouter.post(
  "/:id/transition",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const id = req.params.id;
    const version = req.body?.version;
    const targetStatus = parseEnum<WorkItemStatus>(
      req.body?.targetStatus,
      WORK_ITEM_STATUSES,
      "targetStatus",
    );
    if (typeof version !== "number" || !Number.isInteger(version) || !targetStatus) {
      throw new HttpError(400, "targetStatus and version are required");
    }

    const existing = await prisma.workItem.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Work item not found");
    const role = assertTeamAccess(user, existing.teamId);

    const rejection = transitionRejection(role, existing.status, targetStatus);
    if (rejection) {
      throw new HttpError(rejection.status, rejection.message);
    }

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.workItem.updateMany({
        where: { id, version, status: existing.status },
        data: {
          status: targetStatus,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) return null;

      await tx.activityEvent.create({
        data: {
          workItemId: id,
          actorId: user.id,
          eventType: "STATUS_CHANGED",
          oldValue: { status: existing.status },
          newValue: { status: targetStatus },
        },
      });

      await enqueueOutbox(tx, "WORK_ITEM_TRANSITIONED", {
        workItemId: id,
        actorId: user.id,
        from: existing.status,
        to: targetStatus,
      });

      return tx.workItem.findUniqueOrThrow({
        where: { id },
        include: itemListInclude,
      });
    });

    if (!item) await conflictResponse(id);
    res.json({ item });
  }),
);

itemsRouter.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const id = req.params.id;
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) throw new HttpError(400, "body is required");

    const existing = await prisma.workItem.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Work item not found");
    const role = assertTeamAccess(user, existing.teamId);
    assertPermission(role, "work_item:comment");

    const result = await prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      const comment = await tx.comment.create({
        data: { workItemId: id, authorId: user.id, body },
        include: { author: { select: { id: true, email: true, name: true } } },
      });

      await tx.activityEvent.create({
        data: {
          workItemId: id,
          actorId: user.id,
          eventType: "COMMENT_ADDED",
          newValue: { commentId: comment.id, body },
        },
      });

      await enqueueOutbox(tx, "WORK_ITEM_COMMENT_ADDED", {
        workItemId: id,
        commentId: comment.id,
        actorId: user.id,
      });

      return comment;
    });

    res.status(201).json({ comment: result });
  }),
);
