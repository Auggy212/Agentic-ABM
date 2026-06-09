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
      company,
      committee: [
        { name: "Asha Rao", role: "Founder", email: "asha@" + company },
        { name: "Rahul Mehta", role: "Head of Growth", email: "rahul@" + company }
      ]
    })
  );
});
