import { Router } from "express";
import { randomUUID } from "crypto";
import { formatError, formatSuccess } from "../../utils/response";

export const intakeRouter = Router();

intakeRouter.post("/intake", (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json(formatError("Invalid intake payload", "BAD_REQUEST"));
    return;
  }

  res.status(201).json(
    formatSuccess({
      intakeId: randomUUID(),
      status: "accepted",
      receivedAt: new Date().toISOString()
    })
  );
});
