import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "newtonite-dev-jwt-secret";
const JWT_EXPIRES_IN = "12h";

export type JwtPayload = {
  sub: string;
  email: string;
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null || !decoded.sub) {
    throw new Error("Invalid token");
  }
  return { sub: String(decoded.sub), email: String(decoded.email ?? "") };
}
