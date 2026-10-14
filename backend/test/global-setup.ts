import pg from "pg";
import { runMigrations } from "../src/db/migrate.js";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://xtreme:xtreme@localhost:5432/xtreme_test";

export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await client.end();
  await runMigrations(TEST_DATABASE_URL);
}
