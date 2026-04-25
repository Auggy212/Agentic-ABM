import { Router } from "express";
import { formatSuccess } from "../../utils/response";

export const accountsRouter = Router();

accountsRouter.get("/accounts", (_req, res) => {
  res.json(
    formatSuccess([
      { id: "acc_1", domain: "sample-startup.in", name: "Sample Startup", icpScore: 78, tier: "T2" }
    ])
  );
});

accountsRouter.get("/accounts/:id", (req, res) => {
  res.json(
    formatSuccess({
      id: req.params.id,
      domain: "sample-startup.in",
      name: "Sample Startup",
      icpScore: 78,
      tier: "T2",
      scoreBreakdown: [
        { factor: "industryFit", score: 84 },
        { factor: "buyingSignals", score: 72 }
      ]
    })
  );
});
