import { Pool } from "pg";
import { env } from "../utils/env";

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL
});

export const testDbConnection = async (): Promise<void> => {
  await pgPool.query("SELECT 1");
};
