import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./app.js";

describe("API smoke", () => {
  it("exposes health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("lists demo users, logs in, and lists team-scoped items", async () => {
    const demo = await request(app).get("/api/auth/demo-users");
    expect(demo.status).toBe(200);
    expect(demo.body.users.length).toBeGreaterThanOrEqual(10);

    const login = await request(app).post("/api/auth/login").send({
      email: "admin@newtonite.io",
      password: "password123",
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    const token = login.body.token as string;

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("admin@newtonite.io");

    const items = await request(app)
      .get("/api/items")
      .query({ limit: 5 })
      .set("Authorization", `Bearer ${token}`);
    expect(items.status).toBe(200);
    expect(items.body.items.length).toBeGreaterThan(0);
    expect(items.body).toHaveProperty("nextCursor");
    expect(items.body).toHaveProperty("hasMore");
    expect(items.body).toHaveProperty("totalCount");

    const worker = await request(app)
      .post("/api/worker/process")
      .set("Authorization", `Bearer ${token}`);
    expect(worker.status).toBe(200);
    expect(worker.body).toHaveProperty("processed");
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/items");
    expect(res.status).toBe(401);
  });
});
