import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { scheduleMaintenance } from "./maintenance.js";

const env = loadEnv();
if (process.env.MIGRATE_ON_START !== "false") await runMigrations(env.DATABASE_URL);

const app = await buildApp(env);
const stopMaintenance = scheduleMaintenance(app.container, app.log);

await app.listen({ port: env.PORT, host: env.HOST });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "shutting down");
    stopMaintenance();
    await app.close();
    process.exit(0);
  });
}
