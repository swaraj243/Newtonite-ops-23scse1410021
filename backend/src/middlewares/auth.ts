import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/jwt.js";
import { toAuthUser } from "../lib/authUser.js";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: {
          include: { team: true },
          orderBy: { team: { name: "asc" } },
        },
      },
    });
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = toAuthUser(user);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
