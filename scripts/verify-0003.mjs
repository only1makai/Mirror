// Applies 0003_readings.sql and adversarially tests its RLS.
//
// Usage: DB_URL="postgresql://..." node scripts/verify-0003.mjs [--skip-apply]
//
// Cross-user isolation is tested WITHOUT creating auth accounts: each probe
// runs `set local role authenticated` plus a synthetic `request.jwt.claims`
// carrying a chosen `sub`, which is what Supabase's auth.uid() reads. Every
// write happens inside a transaction that is ALWAYS rolled back — nothing this
// script inserts survives.
//
// IMPORTANT about what "denied" means per statement type, because the two are
// not the same and conflating them produces a false pass:
//   - INSERT violating a policy raises 42501. A SQLSTATE is available.
//   - SELECT/UPDATE/DELETE are FILTERED by the USING expression. They do not
//     raise; they return or affect zero rows. There is no SQLSTATE to capture.
//     The rigorous test is therefore a PAIR: the owner sees the row and the
//     other user does not. "Zero rows" alone proves nothing — a broken policy
//     that hides the row from everyone looks identical.
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DB_URL;
if (!url) {
  console.error("Need DB_URL. Nothing was applied.");
  process.exit(1);
}
const skipApply = process.argv.includes("--skip-apply");

const MIGRATION = "supabase/migrations/0003_readings.sql";
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// Run fn inside a savepoint; return {ok} or {ok:false, code, message}.
async function probe(fn) {
  await client.query("savepoint p");
  try {
    const r = await fn();
    await client.query("release savepoint p");
    return { ok: true, result: r };
  } catch (e) {
    await client.query("rollback to savepoint p");
    return { ok: false, code: e.code, message: e.message.split("\n")[0] };
  }
}

const asUser = async (sub) => {
  await client.query("set local role authenticated");
  await client.query(`set local request.jwt.claims = '${JSON.stringify({ sub, role: "authenticated" })}'`);
};
const asSuperuser = async () => {
  await client.query("reset role");
  await client.query("set local request.jwt.claims = ''");
};

let exitCode = 0;

try {
  await client.connect();
  const env = await client.query("select current_user, current_setting('is_superuser') su");
  console.log(`connected as ${env.rows[0].current_user} (superuser=${env.rows[0].su})\n`);

  if (skipApply) {
    console.log(`--skip-apply given; not applying ${MIGRATION}\n`);
  } else {
    console.log(`applying ${MIGRATION} ...`);
    await client.query(readFileSync(MIGRATION, "utf8"));
    console.log("applied without error.\n");
  }

  // ---- environment: we need a real session, because sessions.user_id is a
  // real FK to auth.users and this script will not create accounts.
  const sess = await client.query(
    `select s.id session_id, s.user_id from public.sessions s order by s.created_at limit 1`,
  );
  const users = await client.query(`select count(*)::int n from auth.users`);
  console.log(`auth.users: ${users.rows[0].n}   sessions: ${sess.rowCount}`);

  if (sess.rowCount === 0) {
    console.log(
      "\nNo rows in public.sessions. Cross-user RLS cannot be tested honestly\n" +
        "without a real session to hang a reading off (session_id is a NOT NULL\n" +
        "FK, and readings.face_shape_primary_id needs a real reference row too).\n" +
        "Refusing to fabricate one. Create a session through the app, then re-run\n" +
        "with --skip-apply.",
    );
    process.exit(0);
  }

  const { session_id: OWNED_SESSION, user_id: OWNER } = sess.rows[0];
  // A uuid that is deliberately NOT any real user. Never inserted anywhere.
  const OTHER = "00000000-0000-4000-8000-0000000000ff";
  console.log(`owner sub  : ${OWNER}`);
  console.log(`other sub  : ${OTHER} (synthetic, never written)\n`);

  await client.query("begin");

  // ---- self-check: if auth.uid() does not reflect the simulated claim, every
  // probe below would "deny" for the wrong reason and the suite would falsely
  // pass. Verify the mechanism before trusting any result from it.
  console.log("self-check (does the JWT simulation actually drive auth.uid()?):");
  await asUser(OWNER);
  const uidOwner = (await client.query("select auth.uid() u")).rows[0].u;
  await asSuperuser();
  await asUser(OTHER);
  const uidOther = (await client.query("select auth.uid() u")).rows[0].u;
  await asSuperuser();
  const simWorks = uidOwner === OWNER && uidOther === OTHER;
  record("auth.uid() reflects simulated sub", simWorks, `owner->${uidOwner}, other->${uidOther}`);
  if (!simWorks) {
    console.log("\nABORTING: the simulation does not drive auth.uid(), so no RLS result below would mean anything.");
    await client.query("rollback");
    process.exit(1);
  }

  // ---- seed a reading + children as superuser (rolled back at the end)
  const shape = (await client.query(`select id from public.reference_face_shapes order by id limit 1`)).rows[0].id;
  const trait = (await client.query(`select id from public.reference_dimorphism_traits order by id limit 1`)).rows[0].id;
  const cond = (await client.query(`select id from public.reference_conditions order by id limit 1`)).rows[0].id;

  const rd = await client.query(
    `insert into public.readings (session_id, face_shape_primary_id, face_shape_source)
     values ($1,$2,'manual') returning id`,
    [OWNED_SESSION, shape],
  );
  const READING = rd.rows[0].id;
  await client.query(
    `insert into public.reading_dimorphism_findings (reading_id, trait_id, classification)
     values ($1,$2,'mixed_or_neutral')`,
    [READING, trait],
  );
  await client.query(
    `insert into public.condition_findings (reading_id, condition_id) values ($1,$2)`,
    [READING, cond],
  );
  console.log(`\nseeded reading ${READING} on the owner's session (will be rolled back)\n`);

  // ---- composite unique constraint
  console.log("constraint:");
  const dup = await probe(() =>
    client.query(
      `insert into public.reading_dimorphism_findings (reading_id, trait_id, classification)
       values ($1,$2,'masculine_typical')`,
      [READING, trait],
    ),
  );
  record(
    "unique(reading_id, trait_id) rejects duplicate trait",
    !dup.ok && dup.code === "23505",
    dup.ok ? "INSERT SUCCEEDED — constraint not enforced" : `${dup.code} ${dup.message}`,
  );

  // ---- visibility pair, per table
  console.log("\nvisibility (owner must see it AND other must not — both halves required):");
  const TABLES = [
    ["readings", `select 1 from public.readings where id = '${READING}'`],
    ["reading_dimorphism_findings", `select 1 from public.reading_dimorphism_findings where reading_id = '${READING}'`],
    ["condition_findings", `select 1 from public.condition_findings where reading_id = '${READING}'`],
  ];
  for (const [t, q] of TABLES) {
    await asUser(OWNER);
    const ownerSees = (await client.query(q)).rowCount;
    await asSuperuser();
    await asUser(OTHER);
    const otherSees = (await client.query(q)).rowCount;
    await asSuperuser();
    record(
      `${t}: owner sees ${ownerSees}, other sees ${otherSees}`,
      ownerSees > 0 && otherSees === 0,
      ownerSees === 0 ? "owner cannot see own row — policy too strict" : undefined,
    );
  }

  // ---- path guessing: other user asks for the exact known id
  console.log("\npath guessing (other user requests the exact row id):");
  await asUser(OTHER);
  for (const [t, q] of TABLES) {
    const n = (await client.query(q)).rowCount;
    record(`${t}: exact-id lookup by non-owner returns ${n}`, n === 0);
  }
  await asSuperuser();

  // ---- writes as the other user
  console.log("\nwrites as non-owner (INSERT raises 42501; UPDATE/DELETE filter to 0 rows):");
  await asUser(OTHER);
  const ins = await probe(() =>
    client.query(
      `insert into public.readings (session_id, face_shape_primary_id) values ($1,$2)`,
      [OWNED_SESSION, shape],
    ),
  );
  record(
    "INSERT reading onto owner's session denied",
    !ins.ok && ins.code === "42501",
    ins.ok ? "SUCCEEDED — not denied" : `${ins.code} ${ins.message}`,
  );

  const upd = await probe(() =>
    client.query(`update public.readings set model_version='x' where id=$1`, [READING]),
  );
  record(
    "UPDATE owner's reading affects 0 rows",
    upd.ok && upd.result.rowCount === 0,
    upd.ok ? `rowCount=${upd.result.rowCount} (filtered, no error — expected)` : `${upd.code} ${upd.message}`,
  );

  const del = await probe(() =>
    client.query(`delete from public.readings where id=$1`, [READING]),
  );
  record(
    "DELETE owner's reading affects 0 rows",
    del.ok && del.result.rowCount === 0,
    del.ok ? `rowCount=${del.result.rowCount} (filtered, no error — expected)` : `${del.code} ${del.message}`,
  );

  for (const [t, col] of [
    ["reading_dimorphism_findings", "trait_id"],
    ["condition_findings", "condition_id"],
  ]) {
    const v = t === "reading_dimorphism_findings"
      ? `insert into public.${t} (reading_id, ${col}, classification) values ('${READING}','${trait}','mixed_or_neutral')`
      : `insert into public.${t} (reading_id, ${col}) values ('${READING}','${cond}')`;
    const r = await probe(() => client.query(v));
    record(
      `INSERT into ${t} under owner's reading denied`,
      !r.ok && r.code === "42501",
      r.ok ? "SUCCEEDED — not denied" : `${r.code} ${r.message}`,
    );
  }
  await asSuperuser();

  await client.query("rollback");
  console.log("\ntransaction rolled back — nothing this script wrote persists.");

  const failed = results.filter((r) => !r.pass);
  console.log(`\n================ SUMMARY ================`);
  console.log(`checks run    : ${results.length}`);
  console.log(`passed        : ${results.length - failed.length}`);
  console.log(`failed        : ${failed.length}`);
  for (const f of failed) console.log(`  FAILED: ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  if (failed.length) exitCode = 1;
} catch (e) {
  console.error(`\nFAILED: ${e.code ? e.code + " " : ""}${e.message}`);
  if (e.detail) console.error(`detail: ${e.detail}`);
  try { await client.query("rollback"); } catch {}
  exitCode = 1;
} finally {
  await client.end();
  process.exitCode = exitCode;
}
