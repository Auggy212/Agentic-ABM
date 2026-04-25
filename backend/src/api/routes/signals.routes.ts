import { Router } from "express";
import { formatError, formatSuccess } from "../../utils/response";

export const signalsRouter = Router();

signalsRouter.get("/signals", (req, res) => {
  const company = req.query.company as string | undefined;
  if (!company) {
    res.status(400).json(formatError("Query param 'company' is required", "BAD_REQUEST"));
    return;
  }

  res.json(
    formatSuccess({
      company,
      buyingStage: "consideration",
      intentSignals: ["hiring growth marketers", "new Series A funding"],
      intelReport: "High intent based on funding and headcount expansion."
    })
  );
});
