// Applies 0002_reference.sql and runs its full verification plan: row counts,
// RLS read-allow/write-deny per table, then a second apply to prove re-run
// safety. Reports; never patches.
//
// Usage: DB_URL="postgresql://..." node scripts/verify-0002.mjs
//
// RLS note: a direct DB_URL connection authenticates as postgres, a superuser,
// which BYPASSES row level security — testing inserts on that connection would
// pass no matter what the policies say. Every RLS probe below therefore runs
// inside a transaction under `set local role anon`, which is subject to RLS,
// and each probe sits in its own savepoint so a denial doesn't poison the rest.
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DB_URL;
if (!url) {
  console.error("Need DB_URL. Nothing was applied.");
  process.exit(1);
}

const MIGRATION = "supabase/migrations/0002_reference.sql";
const EXPECTED = {
  reference_face_shapes: 6,
  reference_dimorphism_traits: 9,
  reference_skin_types: 4,
  reference_hair_types: 4,
  reference_conditions: 10,
  reference_teeth_shades: 16,
  reference_products: 18,
};

const sql = readFileSync(MIGRATION, "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const counts = async () => {
  const out = {};
  for (const t of Object.keys(EXPECTED)) {
    const { rows } = await client.query(`select count(*)::int n from public.${t}`);
    out[t] = rows[0].n;
  }
  return out;
};

const report = (label, got) => {
  console.log(`\n${label}`);
  let ok = true;
  for (const [t, want] of Object.entries(EXPECTED)) {
    const good = got[t] === want;
    if (!good) ok = false;
    console.log(
      `  ${t.padEnd(30)} expected ${String(want).padStart(2)}  actual ${String(got[t]).padStart(2)}  ${good ? "OK" : "<== MISMATCH"}`,
    );
  }
  return ok;
};

// Minimal legal row per table, used only to see whether the write is refused.
const PROBE = {
  reference_face_shapes:
    `insert into public.reference_face_shapes (id, display_name, definition, measurement_method, source_note) values ('__probe','p','p','p','p')`,
  reference_dimorphism_traits:
    `insert into public.reference_dimorphism_traits (id, display_name, feminine_typical_description, evidence_strength, research_note) values ('__probe','p','p','weak','p')`,
  reference_skin_types:
    `insert into public.reference_skin_types (id, display_name, indicators, common_concerns, sensitivity_note) values ('__probe','p','p',array['p'],'p')`,
  reference_hair_types:
    `insert into public.reference_hair_types (id, display_name, indicators, care_notes) values ('__probe','p','p','p')`,
  reference_conditions:
    `insert into public.reference_conditions (id, display_name, category, presentation, evidence_tier, self_manageable) values ('__probe','p','skin','p','myth',true)`,
  reference_teeth_shades:
    `insert into public.reference_teeth_shades (id, hue_group, hue_label, subdivision, relative_note) values ('__probe','A','p',1,'p')`,
  reference_products:
    `insert into public.reference_products (category, name, evidence_tier, notes, source_note) values ('__probe','p','myth','p','p')`,
};

let exitCode = 0;

try {
  await client.connect();
  const who = await client.query("select current_user, current_setting('is_superuser') su");
  console.log(
    `connected as ${who.rows[0].current_user} (superuser=${who.rows[0].su}) — ` +
      `RLS probes will drop to role anon`,
  );

  console.log(`\napplying ${MIGRATION} (pass 1) ...`);
  await client.query(sql);
  console.log("pass 1 applied without error.");

  const first = await counts();
  const firstOk = report("row counts after pass 1:", first);

  // ---- RLS -----------------------------------------------------------------
  console.log("\nRLS (as role anon — select should succeed, insert should be denied):");
  let rlsOk = true;
  for (const t of Object.keys(EXPECTED)) {
    await client.query("begin");
    try {
      await client.query("set local role anon");

      let selOk = false, selErr = "";
      try {
        await client.query(`select 1 from public.${t} limit 1`);
        selOk = true;
      } catch (e) {
        selErr = `${e.code} ${e.message}`;
      }

      let insDenied = false, insInfo = "";
      await client.query("savepoint probe");
      try {
        await client.query(PROBE[t]);
        insInfo = "SUCCEEDED — write is NOT denied";
        await client.query("rollback to savepoint probe");
      } catch (e) {
        insDenied = true;
        insInfo = `${e.code} ${e.message.split("\n")[0]}`;
        await client.query("rollback to savepoint probe");
      }

      const good = selOk && insDenied;
      if (!good) rlsOk = false;
      console.log(
        `  ${t.padEnd(30)} select=${selOk ? "ALLOW" : `DENIED (${selErr})`}  ` +
          `insert=${insDenied ? "DENIED" : "ALLOWED"}  ${good ? "OK" : "<== UNEXPECTED"}`,
      );
      if (insDenied) console.log(`      reason: ${insInfo}`);
    } finally {
      await client.query("rollback"); // never leave a probe committed
    }
  }

  // ---- re-run safety -------------------------------------------------------
  console.log(`\napplying ${MIGRATION} (pass 2 — re-run safety) ...`);
  await client.query(sql);
  console.log("pass 2 applied without error.");

  const second = await counts();
  const secondOk = report("row counts after pass 2:", second);
  const productsHeld = second.reference_products === 18;
  console.log(
    `\nreference_products after two applies: ${second.reference_products} ` +
      `(want 18, NOT 36) -> ${productsHeld ? "re-run safe" : "DUPLICATED"}`,
  );

  console.log("\n================ SUMMARY ================");
  console.log(`migration applied cleanly : ${firstOk !== undefined ? "yes" : "no"}`);
  console.log(`row counts matched        : ${firstOk && secondOk ? "yes" : "NO"}`);
  console.log(`RLS read-allow/write-deny : ${rlsOk ? "yes" : "NO"}`);
  console.log(`re-run kept products at 18: ${productsHeld ? "yes" : "NO"}`);
  if (!(firstOk && secondOk && rlsOk && productsHeld)) exitCode = 1;
} catch (e) {
  console.error(`\nFAILED: ${e.code ? e.code + " " : ""}${e.message}`);
  if (e.detail) console.error(`detail: ${e.detail}`);
  if (e.hint) console.error(`hint: ${e.hint}`);
  exitCode = 1;
} finally {
  await client.end();
  process.exitCode = exitCode;
}
