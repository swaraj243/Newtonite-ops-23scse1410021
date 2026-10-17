import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}
