import express from "express";
import { authCheck } from "./api/middleware/authCheck";
import { errorHandler } from "./api/middleware/errorHandler";
import { requestLogger } from "./api/middleware/requestLogger";
import { accountsRouter } from "./api/routes/accounts.routes";
import { buyersRouter } from "./api/routes/buyers.routes";
import { campaignsRouter } from "./api/routes/campaigns.routes";
import { intakeRouter } from "./api/routes/intake.routes";
import { messagesRouter } from "./api/routes/messages.routes";
import { signalsRouter } from "./api/routes/signals.routes";
import { verifyRouter } from "./api/routes/verify.routes";
import { formatError } from "./utils/response";
import { formatSuccess } from "./utils/response";

export const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);
app.use(authCheck);

app.get("/health", (_req, res) => {
  res.json(
    formatSuccess({
      status: "ok",
      timestamp: new Date().toISOString()
    })
  );
});

app.use("/api", intakeRouter);
app.use("/api", accountsRouter);
app.use("/api", buyersRouter);
app.use("/api", signalsRouter);
app.use("/api", verifyRouter);
app.use("/api", messagesRouter);
app.use("/api", campaignsRouter);

app.use((_req, res) => {
  res.status(404).json(formatError("Route not found", "NOT_FOUND"));
});

app.use(errorHandler);
