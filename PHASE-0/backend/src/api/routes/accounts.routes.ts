import { Router } from "express";
import { formatSuccess } from "../../utils/response";

export const accountsRouter = Router();

accountsRouter.get("/accounts", (_req, res) => {
  res.json(
    formatSuccess({
      total: 4,
      items: [
        {
          id: "acc_1",
          domain: "sample-startup.in",
          name: "Sample Startup",
          industry: "B2B SaaS",
          geography: "Bengaluru, India",
          employeeCount: 120,
          arr: { currency: "INR", value: 90000000 },
          icpScore: 78,
          tier: "T2",
          scoreUpdatedAt: new Date().toISOString()
        },
        {
          id: "acc_2",
          domain: "northstarhealth.com",
          name: "Northstar Health",
          industry: "Healthcare Technology",
          geography: "Austin, United States",
          employeeCount: 340,
          arr: { currency: "USD", value: 24000000 },
          icpScore: 91,
          tier: "T1",
          scoreUpdatedAt: new Date().toISOString()
        },
        {
          id: "acc_3",
          domain: "verge-logistics.io",
          name: "Verge Logistics",
          industry: "Logistics",
          geography: "Berlin, Germany",
          employeeCount: 640,
          arr: { currency: "EUR", value: 51000000 },
          icpScore: 64,
          tier: "T3",
          scoreUpdatedAt: new Date().toISOString()
        },
        {
          id: "acc_4",
          domain: "latticeworks.ai",
          name: "LatticeWorks",
          industry: "AI Infrastructure",
          geography: "San Francisco, United States",
          employeeCount: 210,
          arr: { currency: "USD", value: 31000000 },
          icpScore: 86,
          tier: "T1",
          scoreUpdatedAt: new Date().toISOString()
        }
      ]
    })
  );
});

accountsRouter.get("/accounts/:id", (req, res) => {
  res.json(
    formatSuccess({
      id: req.params.id,
      domain: "sample-startup.in",
      name: "Sample Startup",
      industry: "B2B SaaS",
      geography: "Bengaluru, India",
      employeeCount: 120,
      arr: { currency: "INR", value: 90000000 },
      icpScore: 78,
      tier: "T2",
      scoreUpdatedAt: new Date().toISOString(),
      scoreBreakdown: [
        { factor: "industryFit", score: 84 },
        { factor: "buyingSignals", score: 72 }
      ]
    })
  );
});
