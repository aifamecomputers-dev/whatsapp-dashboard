import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { initRealtime } from "./realtime/socket.js";

async function main() {
  const app = await buildApp();
  const io = initRealtime(app.server);
  app.decorate("io", io);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info(`server-web listening on :${env.PORT} (${env.NODE_ENV})`);
}

main().catch((err) => {
  logger.error({ err }, "Fatal error starting server-web");
  process.exit(1);
});
