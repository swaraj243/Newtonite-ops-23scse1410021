import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app.js";

async function login(email: string) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: "password123" });
  expect(res.status).toBe(200);
  return res.body as {
    token: string;
    user: {
      id: string;
      memberships: { teamId: string; role: string }[];
    };
  };
}

describe("critical concurrency and RBAC behaviours", () => {
  it("replays POST /api/items for the same Idempotency-Key", async () => {
    const { token, user } = await login("member.ops@newtonite.io");
    const teamId = user.memberships[0]!.teamId;
    const key = randomUUID();
    const payload = {
      title: `Idempotent ${key.slice(0, 8)}`,
      description: "dup check",
      type: "TASK",
      priority: "LOW",
      teamId,
    };

    const first = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(first.status).toBe(201);
    const itemId = first.body.item.id as string;

    const second = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(second.status).toBe(201);
    expect(second.body.item.id).toBe(itemId);
  });

  it("atomic claim returns 409 when the item is already assigned", async () => {
    const { token, user } = await login("member.ops@newtonite.io");
    const teamId = user.memberships[0]!.teamId;
    const created = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: `Claim race ${Date.now()}`,
        description: "unassigned",
        type: "INCIDENT",
        priority: "URGENT",
        teamId,
      });
    expect(created.status).toBe(201);
    const id = created.body.item.id as string;

    const first = await request(app)
      .post(`/api/items/${id}/claim`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.item.assignee.id).toBe(user.id);

    const second = await request(app)
      .post(`/api/items/${id}/claim`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(409);
    expect(second.body.currentItem.id).toBe(id);
  });

  it("optimistic lock returns 409 with currentItem on version mismatch", async () => {
    const { token, user } = await login("member.ops@newtonite.io");
    const teamId = user.memberships[0]!.teamId;
    const created = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: `Lock ${Date.now()}`,
        description: "v1",
        type: "TASK",
        priority: "MEDIUM",
        teamId,
      });
    const id = created.body.item.id as string;

    const ok = await request(app)
      .patch(`/api/items/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ version: 1, title: "updated once" });
    expect(ok.status).toBe(200);
    expect(ok.body.item.version).toBe(2);

    const stale = await request(app)
      .patch(`/api/items/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ version: 1, title: "stale write" });
    expect(stale.status).toBe(409);
    expect(stale.body.currentItem.version).toBe(2);
    expect(stale.body.currentItem.title).toBe("updated once");
  });

  it("rejects VIEWER mutations and invalid/unauthorized transitions", async () => {
    const viewer = await login("viewer.analyst@newtonite.io");
    const member = await login("member.ops@newtonite.io");
    const lead = await login("lead.payments@newtonite.io");
    const paymentsTeamId = lead.user.memberships[0]!.teamId;

    const denied = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${viewer.token}`)
      .send({
        title: "viewer create",
        description: "nope",
        type: "TASK",
        priority: "LOW",
        teamId: viewer.user.memberships[0]!.teamId,
      });
    expect(denied.status).toBe(403);

    const created = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        title: `Workflow ${Date.now()}`,
        description: "transitions",
        type: "TASK",
        priority: "HIGH",
        teamId: paymentsTeamId,
      });
    const id = created.body.item.id as string;

    const invalid = await request(app)
      .post(`/api/items/${id}/transition`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ targetStatus: "CLOSED", version: 1 });
    expect(invalid.status).toBe(400);

    const toProgress = await request(app)
      .post(`/api/items/${id}/transition`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ targetStatus: "IN_PROGRESS", version: 1 });
    expect(toProgress.status).toBe(200);

    const awaitApproval = await request(app)
      .post(`/api/items/${id}/transition`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ targetStatus: "AWAITING_APPROVAL", version: 2 });
    expect(awaitApproval.status).toBe(200);

    const memberApprove = await request(app)
      .post(`/api/items/${id}/transition`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ targetStatus: "RESOLVED", version: 3 });
    expect(memberApprove.status).toBe(403);

    const leadApprove = await request(app)
      .post(`/api/items/${id}/transition`)
      .set("Authorization", `Bearer ${lead.token}`)
      .send({ targetStatus: "RESOLVED", version: 3 });
    expect(leadApprove.status).toBe(200);
  });

  it("returns 403 when reading or mutating another team's item", async () => {
    const member = await login("member.ops@newtonite.io");
    const outsider = await login("member.support@newtonite.io");
    const teamId = member.user.memberships[0]!.teamId;

    const created = await request(app)
      .post("/api/items")
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        title: `Cross team ${Date.now()}`,
        description: "other team",
        type: "TASK",
        priority: "LOW",
        teamId,
      });
    expect(created.status).toBe(201);
    const id = created.body.item.id as string;

    const get = await request(app)
      .get(`/api/items/${id}`)
      .set("Authorization", `Bearer ${outsider.token}`);
    expect(get.status).toBe(403);

    const comment = await request(app)
      .post(`/api/items/${id}/comments`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ body: "should not work" });
    expect(comment.status).toBe(403);
  });
});
