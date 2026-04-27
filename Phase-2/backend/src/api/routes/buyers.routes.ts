import { Router } from "express";
import { formatError, formatSuccess } from "../../utils/response";

export const buyersRouter = Router();

buyersRouter.get("/buyers", (req, res) => {
  const company = req.query.company as string | undefined;
  if (!company) {
    res.status(400).json(formatError("Query param 'company' is required", "BAD_REQUEST"));
    return;
  }

  res.json(
    formatSuccess({
      companyDomain: company,
      committeeSize: 4,
      contacts: [
        {
          contactId: "contact_1",
          fullName: "Asha Rao",
          title: "Founder & CEO",
          seniority: "C-Level",
          email: `asha@${company}`,
          linkedinUrl: "https://linkedin.com/in/asha-rao",
          committeeRole: "decision_maker",
          emailStatus: "valid",
          painPointsSummary:
            "Needs cleaner board-ready pipeline reporting and fewer manual handoffs across GTM systems.",
          recentJobChange: true
        },
        {
          contactId: "contact_2",
          fullName: "Rahul Mehta",
          title: "VP of Revenue Operations",
          seniority: "VP",
          email: `rahul@${company}`,
          linkedinUrl: "https://linkedin.com/in/rahul-mehta",
          committeeRole: "champion",
          emailStatus: "valid",
          painPointsSummary:
            "Wants better attribution, lead routing, and workflow visibility without adding more operational overhead."
        },
        {
          contactId: "contact_3",
          fullName: "Nina Kapoor",
          title: "Director of Finance",
          seniority: "Director",
          email: `nina@${company}`,
          linkedinUrl: "https://linkedin.com/in/nina-kapoor",
          committeeRole: "blocker",
          emailStatus: "unknown",
          painPointsSummary:
            "Focused on ROI proof and careful about overlapping software spend before signing off on new vendors."
        },
        {
          contactId: "contact_4",
          fullName: "Dev Malhotra",
          title: "Head of Demand Generation",
          seniority: "Head",
          email: `dev@${company}`,
          linkedinUrl: "https://linkedin.com/in/dev-malhotra",
          committeeRole: "influencer",
          emailStatus: "invalid",
          painPointsSummary:
            "Needs campaigns to launch faster and is sensitive to slow cross-team coordination during execution."
        }
      ]
    })
  );
});
