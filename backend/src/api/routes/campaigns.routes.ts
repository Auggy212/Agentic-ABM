import { Router } from "express";
import { formatSuccess } from "../../utils/response";

export const campaignsRouter = Router();

campaignsRouter.post("/campaigns/launch", (_req, res) => {
  res.status(201).json(
    formatSuccess({
      campaignId: "cmp_1",
      status: "launched"
    })
  );
});

campaignsRouter.get("/campaigns/report", (_req, res) => {
  res.json(
    formatSuccess({
      date: new Date().toISOString().slice(0, 10),
      delivered: 122,
      opened: 67,
      replied: 14
    })
  );
});

campaignsRouter.get("/campaigns/leads", (_req, res) => {
  res.json(
    formatSuccess([
      { contactId: "con_1", score: 72, status: "sql" },
      { contactId: "con_2", score: 65, status: "sql" }
    ])
  );
});

campaignsRouter.post("/campaigns/handoff/:contactId", (req, res) => {
  res.json(
    formatSuccess({
      contactId: req.params.contactId,
      accepted: true,
      acceptedAt: new Date().toISOString()
    })
  );
});
