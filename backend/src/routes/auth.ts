import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { publicUser, toAuthUser } from "../lib/authUser.js";
import { requireAuth } from "../middlewares/auth.js";
import { asyncHandler } from "../lib/httpError.js";

export const authRouter = Router();

const membershipInclude = {
  memberships: {
    include: { team: true },
    orderBy: { team: { name: "asc" as const } },
  },
} as const;

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: membershipInclude,
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const authUser = toAuthUser(user);
    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user: publicUser(authUser) });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user!) });
  }),
);

authRouter.get(
  "/demo-users",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { email: "asc" },
      include: membershipInclude,
    });
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        memberships: u.memberships.map((m) => ({
          teamId: m.team.id,
          teamName: m.team.name,
          role: m.role,
        })),
      })),
    });
  }),
);
