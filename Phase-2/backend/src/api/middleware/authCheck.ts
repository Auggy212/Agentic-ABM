import { NextFunction, Request, Response } from "express";

export const authCheck = (_req: Request, _res: Response, next: NextFunction): void => {
  // Stub middleware for future authN/authZ checks.
  next();
};
