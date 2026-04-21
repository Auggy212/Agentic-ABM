import { readdir, readFile } from "fs/promises";
import path from "path";
import { pgPool } from "./connection";
import { logger } from "../utils/logger";

const migrationsDir = path.resolve(__dirname, "migrations");

const runMigrations = async (): Promise<void> => {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    logger.info("No migration files found");
    return;
  }

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = await readFile(filePath, "utf-8");
    logger.info({ file }, "Running migration");
    await pgPool.query(sql);
  }

  logger.info({ count: files.length }, "Migrations completed");
};

runMigrations()
  .catch((error) => {
    logger.error({ error }, "Migration run failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgPool.end();
  });
