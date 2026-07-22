// Applies a .sql file to Postgres via the pg driver (no psql binary needed).
// Usage: DB_URL="postgresql://..." node scripts/run-migration.mjs supabase/migrations/0001_init.sql
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DB_URL;
const file = process.argv[2];
if (!url || !file) {
  console.error("Need DB_URL env and a .sql path argument.");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connected. Applying", file, "…");
  await client.query(sql);
  console.log("Migration applied OK.");
} catch (e) {
  console.error("MIGRATION FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
