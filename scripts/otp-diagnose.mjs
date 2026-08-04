// Standing diagnostic for email-OTP sign-in failures: reads what GoTrue
// actually stored, instead of inferring it from the client side.
//
// Reach for this whenever verifyOtp returns a 403 otp_expired. That error is
// GoTrue's catch-all and has already hidden two unrelated bugs in this project
// (a PKCE-flow send that stored no verifiable hash, and a UI that truncated the
// 8-digit code to 6), so it is not, on its own, evidence that anything expired.
//
// GoTrue does not store the OTP. It stores sha224(email + otp) as hex, and on
// /verify it recomputes that hash and looks up the row by it. A lookup miss and
// a genuine expiry return the SAME 403 otp_expired / "Token has expired or is
// invalid" — so the error tells us nothing about which one happened. This
// script tells us which one, by recomputing the hash ourselves and comparing it
// to every token column on the row.
//
// Usage — send yourself a code, do NOT verify it, then run:
//   DB_URL="postgresql://..." node scripts/otp-diagnose.mjs you@example.com 49184328
import crypto from "node:crypto";
import pg from "pg";

const url = process.env.DB_URL;
const [email, token] = process.argv.slice(2);
if (!url || !email || !token) {
  console.error(
    'Need DB_URL env, plus email and token args.\n' +
      'DB_URL="postgresql://..." node scripts/otp-diagnose.mjs you@example.com 49184328',
  );
  process.exit(1);
}

// Mirrors GoTrue's crypto.GenerateTokenHash: hex(sha224(emailOrPhone + otp)).
const hashFor = (e, t) =>
  crypto.createHash("sha224").update(e + t).digest("hex");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

// Every column GoTrue can park an email OTP hash in. Which one it uses depends
// on the flow that generated it (signup confirm vs magiclink vs recovery vs
// email change), and that is precisely what is in question here.
const TOKEN_COLUMNS = [
  "confirmation_token",
  "recovery_token",
  "email_change_token_new",
  "email_change_token_current",
];

try {
  await client.connect();

  // Case-insensitive on purpose: if the stored email differs in case from what
  // we send, the hash can never match, and that is itself the answer.
  const { rows } = await client.query(
    `select id, email, email_confirmed_at, confirmed_at, banned_until,
            deleted_at, is_anonymous, created_at, updated_at,
            confirmation_token, confirmation_sent_at,
            recovery_token, recovery_sent_at,
            email_change_token_new, email_change_token_current, email_change_sent_at,
            now() as db_now
       from auth.users
      where lower(email) = lower($1)
      order by created_at`,
    [email],
  );

  console.log(`\nRows in auth.users matching ${email}: ${rows.length}`);
  if (rows.length === 0) {
    console.log(
      "\n>>> No user row at all. The send never created/updated a user, so no\n" +
        ">>> token could ever match. Look at Auth logs for the send, not the verify.",
    );
    process.exit(0);
  }
  if (rows.length > 1) {
    console.log(
      "\n>>> MULTIPLE ROWS for this address. GoTrue updates one and may verify\n" +
        ">>> against another — this alone explains a permanent otp_expired.",
    );
  }

  const expected = hashFor(email, token);
  console.log(`\nExpected hash sha224("${email}" + "${token}")\n  = ${expected}\n`);

  for (const r of rows) {
    console.log("=".repeat(72));
    console.log(
      JSON.stringify(
        {
          id: r.id,
          email: r.email,
          emailMatchesExactly: r.email === email,
          email_confirmed_at: r.email_confirmed_at,
          banned_until: r.banned_until,
          deleted_at: r.deleted_at,
          is_anonymous: r.is_anonymous,
          db_now: r.db_now,
          confirmation_sent_at: r.confirmation_sent_at,
          recovery_sent_at: r.recovery_sent_at,
          email_change_sent_at: r.email_change_sent_at,
        },
        null,
        2,
      ),
    );

    // Age is computed from the DB's own clock against the DB's own timestamp,
    // so it is immune to any skew on this machine — which is the point.
    for (const [label, sentAt] of [
      ["confirmation_sent_at", r.confirmation_sent_at],
      ["recovery_sent_at", r.recovery_sent_at],
    ]) {
      if (sentAt) {
        const age = (new Date(r.db_now) - new Date(sentAt)) / 1000;
        console.log(`  age via ${label}: ${age.toFixed(1)}s (server-side clock)`);
      }
    }

    console.log("\n  token columns:");
    let hit = null;
    let pkce = null;
    for (const col of TOKEN_COLUMNS) {
      const stored = r[col];
      const state =
        stored === null ? "NULL" : stored === "" ? "EMPTY" : `${stored.slice(0, 16)}…`;
      const match = stored && stored === expected;
      if (match) hit = col;
      // The tell for a PKCE-issued token: GoTrue prefixes it literally, and no
      // sha224 hex hash can ever start this way, so it is unambiguous.
      if (stored && stored.startsWith("pkce_")) pkce = col;
      console.log(
        `    ${col.padEnd(28)} ${state.padEnd(20)}` +
          (match ? "  <== MATCHES" : "") +
          (stored && stored.startsWith("pkce_") ? "  <== PKCE TOKEN" : ""),
      );
    }

    console.log("");
    if (pkce) {
      console.log(
        `  >>> ${pkce} holds a pkce_ token: the send still ran under the PKCE\n` +
          `  >>> flow, so no verifiable OTP hash was ever stored and verifyOtp\n` +
          `  >>> cannot succeed for any type. The send is not using the implicit\n` +
          `  >>> client — check that sendCode calls createOtpSendClient().`,
      );
    } else if (hit) {
      console.log(
        `  >>> The hash MATCHES ${hit}. The token is present and correct, so the\n` +
          `  >>> 403 is a real server-side expiry/consumption decision, not a lookup\n` +
          `  >>> miss. Compare the age above against the configured OTP expiry —\n` +
          `  >>> if the age is small, this is a genuine GoTrue bug worth a support\n` +
          `  >>> ticket, and this output is the evidence to attach.`,
      );
    } else {
      const anySet = TOKEN_COLUMNS.some((c) => r[c]);
      console.log(
        anySet
          ? "  >>> A token IS stored, but NOT for this email+code pair. The code you\n" +
            "  >>> typed was not generated for this address, or was superseded by a\n" +
            "  >>> later send that overwrote it. Check the email's own Date header\n" +
            "  >>> against the send that immediately preceded your verify."
          : "  >>> NO token stored on this row at all. GoTrue never persisted one,\n" +
            "  >>> so nothing could ever verify. Suspect a Send Email hook or a\n" +
            "  >>> template/flow that emitted a code GoTrue did not record.",
      );
    }
  }
  console.log("=".repeat(72));
} catch (e) {
  console.error("DIAGNOSE FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
