import "dotenv/config";
import { afterAll } from "vitest";
import { prisma } from "../lib/prisma.js";

afterAll(async () => {
  await prisma.$disconnect();
});
