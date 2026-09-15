// Step 0b (07_BUILD_SEQUENCE.md) synthetic-data inventory. READ-ONLY.
//
// This script contains no INSERT, UPDATE, or DELETE anywhere — every query is
// a plain `select`. It exists to answer "what's actually in the database"
// before anyone writes a delete script, not to act on that answer.
//
// Usage: DB_URL="postgresql://..." node scripts/inventory-0b.mjs
import pg from "pg";

const url = process.env.DB_URL;
if (!url) {
  console.error("Need DB_URL. Nothing was queried.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const hr = (t) => console.log(`\n${"=".repeat(78)}\n${t}\n${"=".repeat(78)}`);

try {
  await client.connect();
  const who = await client.query(
    "select current_user, current_setting('is_superuser') su, now() as db_now",
  );
  console.log(
    `connected as ${who.rows[0].current_user} (superuser=${who.rows[0].su}), db time ${who.rows[0].db_now}`,
  );

  // ---- 1. sessions, every column that could hint real vs. synthetic --------
  hr("1. sessions — full list");
  const sessions = await client.query(`
    select s.id, s.user_id, s.captured_at, s.created_at,
           s.lighting_score, s.notes,
           u.email as owner_email
      from public.sessions s
      left join auth.users u on u.id = s.user_id
     order by s.captured_at asc
  `);
  console.log(`total sessions: ${sessions.rowCount}\n`);
  for (const r of sessions.rows) {
    console.log(
      JSON.stringify(
        {
          id: r.id,
          owner_email: r.owner_email,
          user_id: r.user_id,
          captured_at: r.captured_at,
          created_at: r.created_at,
          lighting_score: r.lighting_score,
          notes: r.notes,
        },
        null,
        2,
      ),
    );
  }

  // ---- 2. photos per session -------------------------------------------
  hr("2. photos per session (count + angles + storage_path)");
  for (const s of sessions.rows) {
    const photos = await client.query(
      `select id, angle, storage_path, width, height, created_at
         from public.photos where session_id = $1
        order by angle`,
      [s.id],
    );
    console.log(`\nsession ${s.id}  (captured_at ${s.captured_at?.toISOString?.() ?? s.captured_at})`);
    console.log(`  photo count: ${photos.rowCount}`);
    if (photos.rowCount === 0) {
      console.log("    (no photo rows)");
    }
    for (const p of photos.rows) {
      console.log(
        `    angle=${String(p.angle).padEnd(6)} storage_path=${p.storage_path}  ` +
          `${p.width ?? "?"}x${p.height ?? "?"}  created_at=${p.created_at?.toISOString?.() ?? p.created_at}`,
      );
    }
    const angles = photos.rows.map((p) => p.angle).sort().join(",");
    const expected = "front,left,right";
    console.log(
      `  angle set: [${angles || "(none)"}]  ${angles === expected ? "matches expected front/left/right" : "DOES NOT match expected front/left/right"}`,
    );
  }

  // ---- 3. logs — full table -----------------------------------------------
  hr("3. logs — full table");
  const logs = await client.query(`
    select id, user_id, date, sleep_hours, note, shine_tzone, shine_cheeks,
           breakout_count, breakout_zones, dryness, irritation, created_at
      from public.logs
     order by date asc
  `);
  console.log(`total log rows: ${logs.rowCount}\n`);
  for (const r of logs.rows) {
    const allZeroish =
      (r.sleep_hours === null || r.sleep_hours === 0) &&
      (r.shine_tzone === null || r.shine_tzone === 0) &&
      (r.shine_cheeks === null || r.shine_cheeks === 0) &&
      (r.breakout_count === null || r.breakout_count === 0) &&
      (r.dryness === null || r.dryness === 0) &&
      r.irritation === false &&
      (r.note === null || r.note === "") &&
      (!r.breakout_zones || r.breakout_zones.length === 0 || JSON.stringify(r.breakout_zones) === "[]");
    console.log(
      JSON.stringify(
        {
          id: r.id,
          user_id: r.user_id,
          date: r.date,
          created_at: r.created_at,
          sleep_hours: r.sleep_hours,
          note: r.note,
          shine_tzone: r.shine_tzone,
          shine_cheeks: r.shine_cheeks,
          breakout_count: r.breakout_count,
          breakout_zones: r.breakout_zones,
          dryness: r.dryness,
          irritation: r.irritation,
        },
        null,
        2,
      ),
    );
    console.log(
      `  ^ all-fields-at-default-looking: ${allZeroish} ` +
        `(this is a REAL SAVED ROW either way — it exists in the table; ` +
        `"all zero" only describes its contents, not whether it's a row at all)`,
    );
  }
  if (logs.rowCount === 0) {
    console.log(
      "No rows in public.logs at all. If the app shows an Aug 5 entry with " +
        "every field at 0, that is the unfilled FORM DEFAULT rendered client-side, " +
        "not a persisted row — nothing has been saved for that date.",
    );
  }

  // ---- 4. storage_path scan for placeholder/seed-looking values -----------
  hr("4. photos.storage_path — full scan for placeholder/seed-looking values");
  const allPhotos = await client.query(`
    select p.id, p.session_id, p.angle, p.storage_path, p.width, p.height, p.created_at,
           s.captured_at as session_captured_at
      from public.photos p
      join public.sessions s on s.id = p.session_id
     order by s.captured_at asc, p.angle
  `);
  console.log(`total photo rows across all sessions: ${allPhotos.rowCount}\n`);
  const suspiciousPattern = /test|sample|placeholder|seed|dummy|fake|example|lorem|fixture|mock/i;
  for (const p of allPhotos.rows) {
    const flagged = suspiciousPattern.test(p.storage_path);
    console.log(
      `  session ${p.session_id}  angle=${String(p.angle).padEnd(6)} ` +
        `${p.width ?? "?"}x${p.height ?? "?"}  path="${p.storage_path}"` +
        `${flagged ? "  <== MATCHES placeholder/seed pattern" : ""}`,
    );
  }
  const anyFlagged = allPhotos.rows.some((p) => suspiciousPattern.test(p.storage_path));
  if (!anyFlagged) {
    console.log(
      "\nNo storage_path matched an obvious placeholder/seed naming pattern " +
        "(test/sample/placeholder/seed/dummy/fake/example/lorem/fixture/mock). " +
        "That is not proof every photo is real — a synthetic upload could use a " +
        "normal-looking generated filename. Zero photo rows for a session, or an " +
        "incomplete angle set, is a stronger and independently-checked signal — " +
        "see section 2 above.",
    );
  }

  hr("SUMMARY (for the repo owner's confirmation — this script decides nothing)");
  console.log(`sessions total          : ${sessions.rowCount}`);
  console.log(`logs total              : ${logs.rowCount}`);
  console.log(`photo rows total        : ${allPhotos.rowCount}`);
  console.log(
    "\nNo delete statement exists in this script. Cross-reference the per-session " +
      "photo angle sets, dates, and owner_email above against what the repo owner " +
      "confirms is real before anyone writes a delete script.",
  );
} catch (e) {
  console.error(`\nFAILED: ${e.code ? e.code + " " : ""}${e.message}`);
  if (e.detail) console.error(`detail: ${e.detail}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
