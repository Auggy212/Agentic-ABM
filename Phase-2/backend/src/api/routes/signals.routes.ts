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
      companyDomain: company,
      buyingStage: "evaluating",
      intentScore: 81,
      signals: [
        {
          signalId: "signal_1",
          type: "funding",
          source: "news",
          strength: 88,
          observedAt: new Date().toISOString(),
          summary: "Closed a new funding round to accelerate GTM hiring."
        },
        {
          signalId: "signal_2",
          type: "hiring",
          source: "linkedin",
          strength: 71,
          observedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
          summary: "Actively hiring for RevOps and demand generation roles."
        },
        {
          signalId: "signal_3",
          type: "news",
          source: "press",
          strength: 29,
          observedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
          summary: "Expanded into a new market with a fresh revenue team mandate."
        }
      ],
      intelReport: {
        companySnapshot: [
          "Growth-stage B2B SaaS company with expanding revenue operations needs.",
          "Recent scale signals suggest active evaluation of systems and process upgrades."
        ],
        strategicPriorities: [
          "Improve forecast visibility for leadership.",
          "Reduce friction between marketing, SDR, and AE workflows."
        ],
        techStack: ["Salesforce", "HubSpot", "Apollo", "Gong", "Looker"],
        painPoints: [
          "Attribution reporting is fragmented.",
          "Manual board reporting still consumes RevOps time.",
          "Cross-functional handoffs are hard to audit."
        ],
        recentNews: [
          "Closed a fresh funding round this quarter.",
          "Opened multiple GTM hiring roles tied to revenue scale-up."
        ],
        recommendedOutreach:
          "Anchor outreach on RevOps efficiency and leadership visibility, then tie those gains to the company’s recent expansion signals."
      }
    })
  );
});
