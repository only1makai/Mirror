// Deletes the confirmed synthetic test data from Step 0b (07_BUILD_SEQUENCE.md).
// Targets are HARDCODED by id, not by date/pattern — confirmed by the repo
// owner against inventory-0b.mjs's output (seed notes + placeholder .png
// resolution on both, vs real .jpg captures on the two kept sessions).
//
// Usage:
//   DB_URL="postgresql://..." node scripts/wipe-0b.mjs              (dry run — reports only)
//   DB_URL="postgresql://..." node scripts/wipe-0b.mjs --confirm    (actually deletes)
//
// Safety behavior:
//   - Dry run is the default. Nothing is deleted without --confirm.
//   - Before deleting anything, re-fetches each target row and checks it
//     still matches the exact marker that justified deleting it (session
//     notes = 'seed 30d' / 'seed 0d', log id matches). If any target has
//     changed or no longer matches, the whole run aborts before touching
//     anything — better to fail loudly than delete something that was
//     real by the time this actually runs.
//   - Runs inside a single transaction. Any failure rolls back everything.
//   - Deletes photos rows, then session rows, then the log row, explicitly,
//     in that order — rather than relying only on the ON DELETE CASCADE that
//     photos.session_id already carries in 0001_init.sql (confirmed when
//     0001 was read directly for the 0003 RLS review). Belt and braces: the
//     cascade would handle it too, but an explicit delete makes the rowCount
//     reported below meaningful and doesn't depend on remembering a FK
//     behavior defined in a different migration file.
//
// NOT handled by this script: the 6 actual photo files in Supabase Storage.
// Deleting those requires the Storage API/bucket name/service-role setup,
// none of which has been confirmed in this chat — safer to delete these
// 6 objects manually via the Supabase dashboard than to guess. Paths to
// delete, from inventory-0b.mjs's output:
//
//   c9513742-14d0-4ff7-994a-b9f18580f791/63e11a53-f411-4a1e-8535-004b40b91b64/front.png
//   c9513742-14d0-4ff7-994a-b9f18580f791/63e11a53-f411-4a1e-8535-004b40b91b64/left.png
//   c9513742-14d0-4ff7-994a-b9f18580f791/63e11a53-f411-4a1e-8535-004b40b91b64/right.png
//   c9513742-14d0-4ff7-994a-b9f18580f791/89f54aa7-bfb5-4fd6-af93-34c9c55241cf/front.png
//   c9513742-14d0-4ff7-994a-b9f18580f791/89f54aa7-bfb5-4fd6-af93-34c9c55241cf/left.png
//   c9513742-14d0-4ff7-994a-b9f18580f791/89f54aa7-bfb5-4fd6-af93-34c9c55241cf/right.png
//
// Supabase dashboard: Storage -> (the bucket holding these) -> navigate to
// each path above -> delete. All 6 share the .png extension and the 480x640
// dimensions that distinguish them from the two real .jpg sessions kept.

import pg from 'pg';

const DB_URL = process.env.DB_URL;
const CONFIRM = process.argv.includes('--confirm');

if (!DB_URL) {
  console.error('DB_URL is not set.');
  process.exit(1);
}

const FAKE_SESSIONS = [
  { id: '63e11a53-f411-4a1e-8535-004b40b91b64', expected_notes: 'seed 30d' },
  { id: '89f54aa7-bfb5-4fd6-af93-34c9c55241cf', expected_notes: 'seed 0d' },
];
const FAKE_LOG_ID = '99b61629-1312-443f-aee7-9cd8aac1fdf1';

const KEEP_SESSIONS = [
  'd1eaf234-1589-4df3-904e-bbd20e279108', // Aug 4, real
  '331c9efe-5969-41c0-b3cd-be99bb356edc', // Aug 5, real
];

const client = new pg.Client({ connectionString: DB_URL });

async function main() {
  await client.connect();
  console.log(`connected as ${(await client.query('select current_user')).rows[0].current_user}`);
  console.log(CONFIRM ? 'MODE: --confirm (will delete)' : 'MODE: dry run (no changes will be made)');
  console.log('');

  await client.query('begin');

  try {
    // --- safety re-check: every target still matches its expected marker ---
    console.log('safety re-check before touching anything:');
    for (const s of FAKE_SESSIONS) {
      const { rows } = await client.query(
        'select id, notes, captured_at from sessions where id = $1',
        [s.id]
      );
      if (rows.length === 0) {
        throw new Error(`ABORT: session ${s.id} no longer exists — nothing to delete, but also nothing to verify. Stopping rather than assuming.`);
      }
      if (rows[0].notes !== s.expected_notes) {
        throw new Error(`ABORT: session ${s.id} notes is "${rows[0].notes}", expected "${s.expected_notes}". This row may have changed since confirmation. Stopping.`);
      }
      console.log(`  PASS  session ${s.id}  notes="${rows[0].notes}" matches expected`);
    }
    {
      const { rows } = await client.query('select id, date from logs where id = $1', [FAKE_LOG_ID]);
      if (rows.length === 0) {
        throw new Error(`ABORT: log ${FAKE_LOG_ID} no longer exists. Stopping.`);
      }
      console.log(`  PASS  log ${FAKE_LOG_ID}  date=${rows[0].date} exists as expected`);
    }
    for (const id of KEEP_SESSIONS) {
      const { rows } = await client.query('select id from sessions where id = $1', [id]);
      if (rows.length === 0) {
        throw new Error(`ABORT: a session marked KEEP (${id}) does not exist. Something is wrong — stopping rather than proceeding blind.`);
      }
      console.log(`  PASS  session ${id} (real, kept) still present`);
    }
    console.log('');

    // --- report what will be / was affected ---
    const sessionIds = FAKE_SESSIONS.map(s => s.id);
    const { rows: photoRows } = await client.query(
      'select id, session_id, angle, storage_path from photos where session_id = any($1::uuid[])',
      [sessionIds]
    );
    console.log(`photos to delete: ${photoRows.length}`);
    for (const p of photoRows) {
      console.log(`  ${p.session_id}  angle=${p.angle}  path=${p.storage_path}`);
    }
    console.log(`sessions to delete: ${sessionIds.length}`);
    console.log(`log rows to delete: 1 (${FAKE_LOG_ID})`);
    console.log('');

    if (!CONFIRM) {
      console.log('Dry run only — no changes made. Re-run with --confirm to actually delete.');
      await client.query('rollback');
      return;
    }

    // --- actual deletes, explicit order, no reliance on assumed cascade ---
    const photoDelete = await client.query(
      'delete from photos where session_id = any($1::uuid[])',
      [sessionIds]
    );
    console.log(`deleted ${photoDelete.rowCount} photo rows`);

    const sessionDelete = await client.query(
      'delete from sessions where id = any($1::uuid[])',
      [sessionIds]
    );
    console.log(`deleted ${sessionDelete.rowCount} session rows`);

    const logDelete = await client.query('delete from logs where id = $1', [FAKE_LOG_ID]);
    console.log(`deleted ${logDelete.rowCount} log row`);

    await client.query('commit');
    console.log('');
    console.log('COMMITTED. Now go delete the 6 Storage objects listed in the header comment above, manually, via the Supabase dashboard.');

    const { rows: finalSessions } = await client.query('select count(*) from sessions');
    const { rows: finalLogs } = await client.query('select count(*) from logs');
    console.log(`sessions remaining: ${finalSessions[0].count} (expected 2)`);
    console.log(`logs remaining: ${finalLogs[0].count} (expected 0)`);
  } catch (err) {
    await client.query('rollback');
    console.error('');
    console.error('ROLLED BACK. Nothing was deleted.');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
