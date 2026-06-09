import { Router } from "express";
import { formatSuccess } from "../../utils/response";

export const verifyRouter = Router();

verifyRouter.post("/verify", (_req, res) => {
  res.status(201).json(
    formatSuccess({
      verificationId: "ver_1",
      status: "queued"
    })
  );
});

verifyRouter.get("/verify/status", (_req, res) => {
  res.json(
    formatSuccess({
      verificationId: "ver_1",
      status: "completed",
      passed: 42,
      failed: 3
    })
  );
});
