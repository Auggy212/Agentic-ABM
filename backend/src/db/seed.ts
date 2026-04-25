import { pgPool } from "./connection";
import { logger } from "../utils/logger";

const seed = async (): Promise<void> => {
  const accountResult = await pgPool.query(
    `INSERT INTO accounts (domain, name, icp_score, tier, data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (domain) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ["sample-startup.in", "Sample Startup", 78, "T2", { industry: "B2B SaaS" }]
  );

  const accountId = accountResult.rows[0]?.id as string;

  await pgPool.query(
    `INSERT INTO contacts (account_id, email, email_status, role, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [accountId, "founder@sample-startup.in", "valid", "Founder", { seniority: "C-Level" }]
  );

  logger.info("Seed completed");
};

seed()
  .catch((error) => {
    logger.error({ error }, "Seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
