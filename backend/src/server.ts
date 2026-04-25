import { app } from "./app";
import { env } from "./utils/env";
import { logger } from "./utils/logger";

app.listen(env.PORT, () => {
  logger.info(`ABM backend listening on port ${env.PORT}`);
});
