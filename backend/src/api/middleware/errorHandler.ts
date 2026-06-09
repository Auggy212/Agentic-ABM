import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { formatError } from "../../utils/response";

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ZodError) {
    res.status(422).json(formatError(err.issues.map((issue) => issue.message).join(", "), "VALIDATION_ERROR"));
    return;
  }

  if (err instanceof Error) {
    res.status(500).json(formatError(err.message, "INTERNAL_SERVER_ERROR"));
    return;
  }

  res.status(500).json(formatError("Unexpected error", "INTERNAL_SERVER_ERROR"));
};
