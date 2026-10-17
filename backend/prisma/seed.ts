import "dotenv/config";
import {
  PrismaClient,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
  MembershipRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

const TEAM_NAMES = [
  "Payments Operations",
  "Core Infrastructure",
  "Customer Trust",
  "Compliance & Legal",
] as const;

const WORK_ITEM_COUNT = 2500;
const BATCH_SIZE = 500;

const TYPES = Object.values(WorkItemType);
const PRIORITIES = Object.values(WorkItemPriority);
const STATUSES = Object.values(WorkItemStatus);

const INCIDENT_TITLES = [
  "Elevated error rate on payment gateway",
  "Database connection pool exhaustion",
  "CDN latency spike in EU region",
  "Webhook delivery backlog",
  "API rate limit false positives",
];

const CUSTOMER_TITLES = [
  "Refund not reflected in account",
  "Unable to verify identity document",
  "Duplicate charge on statement",
  "Account locked after password reset",
  "Missing transaction history export",
];

const PAYMENT_TITLES = [
  "Reconcile settlement batch #",
  "Chargeback dispute review",
  "Failed ACH retry queue",
  "Merchant onboarding KYC hold",
  "FX conversion discrepancy",
];

const COMPLIANCE_TITLES = [
  "Annual SOC2 evidence collection",
  "GDPR data subject request",
  "Policy attestation overdue",
  "Vendor risk assessment renewal",
  "Audit trail export for regulator",
];

const TASK_TITLES = [
  "Update runbook for on-call rotation",
  "Migrate legacy job scheduler",
  "Document incident response playbook",
  "Capacity planning for peak season",
  "Clean up stale feature flags",
];

const COMMENT_SNIPPETS = [
  "Investigating root cause with vendor.",
  "Customer confirmed issue is resolved on their side.",
  "Escalated to LEAD for approval.",
  "Added monitoring alert for recurrence.",
  "Waiting on legal review before closure.",
  "Patch deployed to staging; validating now.",
  "Linked to related incident from last week.",
  "Assignee on PTO — reassigning temporarily.",
];

function pick<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length]!;
}

function titleForType(type: WorkItemType, seq: number): string {
  const n = seq + 1;
  switch (type) {
    case WorkItemType.INCIDENT:
      return `${pick(INCIDENT_TITLES, seq)} (#${n})`;
    case WorkItemType.CUSTOMER_ISSUE:
      return `${pick(CUSTOMER_TITLES, seq)} — ticket ${n}`;
    case WorkItemType.PAYMENT:
      return `${pick(PAYMENT_TITLES, seq)} ${n}`;
    case WorkItemType.COMPLIANCE:
      return `${pick(COMPLIANCE_TITLES, seq)} [${n}]`;
    case WorkItemType.TASK:
      return `${pick(TASK_TITLES, seq)} (${n})`;
  }
}

function descriptionFor(i: number): string {
  return `Seeded work item ${i + 1} for Newtonite Ops demo data. Includes realistic ops context for filtering, pagination, and activity timelines.`;
}

async function main() {
  const start = Date.now();
  console.log("Seeding database…");

  await prisma.outboxJob.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  const passwordHash = await bcrypt.hash("password123", 10);

  const teams = await Promise.all(
    TEAM_NAMES.map((name) => prisma.team.create({ data: { name } })),
  );

  type UserSeed = {
    email: string;
    name: string;
    memberships: { teamIndex: number; role: MembershipRole }[];
  };

  const userSeeds: UserSeed[] = [
    {
      email: "admin@newtonite.io",
      name: "Alex Admin",
      memberships: [
        { teamIndex: 0, role: MembershipRole.ADMIN },
        { teamIndex: 1, role: MembershipRole.ADMIN },
        { teamIndex: 2, role: MembershipRole.ADMIN },
        { teamIndex: 3, role: MembershipRole.ADMIN },
      ],
    },
    {
      email: "lead.payments@newtonite.io",
      name: "Priya Payments",
      memberships: [{ teamIndex: 0, role: MembershipRole.LEAD }],
    },
    {
      email: "lead.infra@newtonite.io",
      name: "Jordan Infra",
      memberships: [{ teamIndex: 1, role: MembershipRole.LEAD }],
    },
    {
      email: "lead.trust@newtonite.io",
      name: "Sam Trust",
      memberships: [{ teamIndex: 2, role: MembershipRole.LEAD }],
    },
    {
      email: "lead.compliance@newtonite.io",
      name: "Casey Compliance",
      memberships: [{ teamIndex: 3, role: MembershipRole.LEAD }],
    },
    {
      email: "member.ops@newtonite.io",
      name: "Morgan Ops",
      memberships: [
        { teamIndex: 0, role: MembershipRole.MEMBER },
        { teamIndex: 1, role: MembershipRole.MEMBER },
      ],
    },
    {
      email: "member.support@newtonite.io",
      name: "Riley Support",
      memberships: [{ teamIndex: 2, role: MembershipRole.MEMBER }],
    },
    {
      email: "member.legal@newtonite.io",
      name: "Taylor Legal",
      memberships: [{ teamIndex: 3, role: MembershipRole.MEMBER }],
    },
    {
      email: "viewer.analyst@newtonite.io",
      name: "Jamie Analyst",
      memberships: [
        { teamIndex: 0, role: MembershipRole.VIEWER },
        { teamIndex: 2, role: MembershipRole.VIEWER },
      ],
    },
    {
      email: "viewer.audit@newtonite.io",
      name: "Quinn Audit",
      memberships: [
        { teamIndex: 3, role: MembershipRole.VIEWER },
        { teamIndex: 1, role: MembershipRole.VIEWER },
      ],
    },
  ];

  const users = await Promise.all(
    userSeeds.map((u) =>
      prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash,
        },
      }),
    ),
  );

  const membershipRows = userSeeds.flatMap((u, ui) =>
    u.memberships.map((m) => ({
      id: randomUUID(),
      userId: users[ui]!.id,
      teamId: teams[m.teamIndex]!.id,
      role: m.role,
    })),
  );

  await prisma.membership.createMany({ data: membershipRows });

  const adminId = users[0]!.id;
  const memberIds = users.filter((_, i) => i >= 5 && i <= 7).map((u) => u.id);

  const now = Date.now();
  const workItemRows: {
    id: string;
    title: string;
    description: string;
    type: WorkItemType;
    priority: WorkItemPriority;
    status: WorkItemStatus;
    teamId: string;
    assigneeId: string | null;
    createdById: string;
    dueDate: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];

  for (let i = 0; i < WORK_ITEM_COUNT; i++) {
    const team = teams[i % teams.length]!;
    const type = pick(TYPES, i + Math.floor(i / 7));
    const priority = pick(PRIORITIES, i * 3 + 1);
    const status = pick(STATUSES, i * 5 + 2);
    const createdById = i % 4 === 0 ? adminId : pick(memberIds, i);
    const assigneeId =
      status === WorkItemStatus.OPEN && i % 5 === 0
        ? null
        : pick(memberIds, i + 1);
    const daysOffset = (i % 90) - 30;
    const createdAt = new Date(now - daysOffset * 86400000 - (i % 86400000));
    const dueDate =
      i % 3 === 0 ? new Date(createdAt.getTime() + 7 * 86400000) : null;

    workItemRows.push({
      id: randomUUID(),
      title: titleForType(type, i),
      description: descriptionFor(i),
      type,
      priority,
      status,
      teamId: team.id,
      assigneeId,
      createdById,
      dueDate,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    });
  }

  for (let offset = 0; offset < workItemRows.length; offset += BATCH_SIZE) {
    const chunk = workItemRows.slice(offset, offset + BATCH_SIZE);
    await prisma.workItem.createMany({ data: chunk });
  }

  const activityRows: {
    id: string;
    workItemId: string;
    actorId: string;
    eventType: string;
    oldValue: null;
    newValue: object;
    createdAt: Date;
  }[] = [];

  const commentRows: {
    id: string;
    workItemId: string;
    authorId: string;
    body: string;
    createdAt: Date;
  }[] = [];

  for (let i = 0; i < workItemRows.length; i++) {
    const wi = workItemRows[i]!;
    activityRows.push({
      id: randomUUID(),
      workItemId: wi.id,
      actorId: wi.createdById,
      eventType: "CREATED",
      oldValue: null,
      newValue: {
        status: wi.status,
        priority: wi.priority,
        type: wi.type,
        title: wi.title,
      },
      createdAt: wi.createdAt,
    });

    if (i % 2 === 0) {
      activityRows.push({
        id: randomUUID(),
        workItemId: wi.id,
        actorId: wi.assigneeId ?? wi.createdById,
        eventType: "STATUS_CHANGED",
        oldValue: { status: WorkItemStatus.OPEN },
        newValue: { status: wi.status },
        createdAt: new Date(wi.createdAt.getTime() + 3600000),
      });
    }

    if (i % 4 === 0) {
      commentRows.push({
        id: randomUUID(),
        workItemId: wi.id,
        authorId: wi.assigneeId ?? wi.createdById,
        body: pick(COMMENT_SNIPPETS, i),
        createdAt: new Date(wi.createdAt.getTime() + 7200000),
      });
    }
  }

  for (let offset = 0; offset < activityRows.length; offset += BATCH_SIZE) {
    await prisma.activityEvent.createMany({
      data: activityRows.slice(offset, offset + BATCH_SIZE),
    });
  }

  for (let offset = 0; offset < commentRows.length; offset += BATCH_SIZE) {
    await prisma.comment.createMany({
      data: commentRows.slice(offset, offset + BATCH_SIZE),
    });
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(
    `Seed complete: ${teams.length} teams, ${users.length} users, ${WORK_ITEM_COUNT} work items, ${activityRows.length} activity events, ${commentRows.length} comments (${elapsed}s)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
