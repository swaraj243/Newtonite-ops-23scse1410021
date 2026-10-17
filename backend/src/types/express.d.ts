import type { AuthUser } from "../lib/authUser.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      idempotencyKey?: string;
    }
  }
}

export {};
