// Confirms the reference-table columns and ids that the vision route depends
// on actually exist in the live database, using the exact select strings from
// src/lib/vision/reference.ts. Run this after any change to 0002_reference.sql.
//
// Usage: node scripts/verify-vocab.mjs
//
// Reads .env.local and connects with the anon key on purpose: the reference_*
// tables are world-readable (`for select using (true)`), and the route reads
// them as the signed-in user, so anon is the right privilege level to prove
// they are reachable without one.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

// table -> [select string, expected row count from 0002_reference.sql]
const QUERIES = {
  reference_face_shapes: ["id, display_name, definition", 6],
  reference_skin_types: ["id, display_name, indicators", 4],
  reference_hair_types: ["id, display_name, indicators", 4],
  reference_dimorphism_traits: [
    "id, display_name, masculine_typical_description, feminine_typical_description",
    9,
  ],
  reference_conditions: ["id, display_name, presentation", 10],
};

let failures = 0;

for (const [table, [cols, expected]] of Object.entries(QUERIES)) {
  const { data, error } = await sb.from(table).select(cols).order("id");

  if (error) {
    console.log(`FAIL ${table}: ${error.message}`);
    failures++;
    continue;
  }

  const ids = data.map((r) => r.id);
  // A count mismatch is a warning, not a failure: the route reads whatever is
  // seeded, so extra rows are fine. It still gets reported, because an
  // unexpected count usually means a migration was half-applied.
  const note =
    data.length === expected ? "" : `  (expected ${expected} rows per 0002)`;
  console.log(`ok   ${table}: ${data.length} rows${note}`);
  console.log(`     ${ids.join(", ")}`);
}

if (failures > 0) {
  console.log(
    `\n${failures} table(s) failed. The vision route will error at request time until this is fixed.`,
  );
  process.exit(1);
}

console.log("\nAll reference columns the vision route selects are present.");
