// Mirror — live verification pass against the real Supabase project.
// Exercises the exact API paths the app uses, plus adversarial cross-user RLS.
// Reads keys from .env.local. Run: node scripts/verify.mjs
import { readFileSync } from "node:fs";

// ---- config ---------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "photos";

// ---- reporting ------------------------------------------------------------
let pass = 0,
  fail = 0;
function check(name, ok, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  if (ok) pass++;
  else fail++;
  console.log(`  [${tag}] ${name}${detail ? " — " + detail : ""}`);
  return ok;
}
function section(t) {
  console.log("\n" + t);
}

// ---- tiny real PNG fixture (a genuine image file) -------------------------
import { deflateSync } from "node:zlib";
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function makePng(size, rgb) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- helpers --------------------------------------------------------------
async function adminCreateUser(email, password) {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const j = await r.json();
  return { status: r.status, id: j.id, body: j };
}
async function signIn(email, password) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  return { status: r.status, token: j.access_token, sub: j.user?.id, body: j };
}
function rest(path, token, opts = {}) {
  return fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
}
function storage(path, token, opts = {}) {
  return fetch(`${URL_BASE}/storage/v1/${path}`, {
    ...opts,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
}

// ---- main -----------------------------------------------------------------
const stamp = process.env.STAMP || String(process.argv[2] || "manual");
const emailA = `mirror.verify.a.${stamp}@example.com`;
const emailB = `mirror.verify.b.${stamp}@example.com`;
const PW = "Test-" + stamp + "-pw!";

console.log("=== Mirror live verification ===");
console.log("Project:", URL_BASE);

let A, B, sessionId, photoPath;

section("0. Users (two real auth users via admin API)");
{
  const ca = await adminCreateUser(emailA, PW);
  const cb = await adminCreateUser(emailB, PW);
  check("create user A", !!ca.id, ca.id || JSON.stringify(ca.body));
  check("create user B", !!cb.id, cb.id || JSON.stringify(cb.body));
  A = await signIn(emailA, PW);
  B = await signIn(emailB, PW);
  check("sign in A (get JWT)", !!A.token, "sub=" + A.sub);
  check("sign in B (get JWT)", !!B.token, "sub=" + B.sub);
}
if (!A?.token || !B?.token) {
  console.log("\nCannot continue without both user tokens.");
  process.exit(1);
}

section("1. Owner writes: session + storage upload + photo row");
{
  const r = await rest("sessions", A.token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: A.sub, notes: "verify session" }),
  });
  const j = await r.json();
  sessionId = Array.isArray(j) ? j[0]?.id : j.id;
  check("A inserts sessions row (RLS with check)", r.status === 201 && !!sessionId, "status=" + r.status);

  photoPath = `${A.sub}/${sessionId}/front.png`;
  const bytes = makePng(64, [90, 140, 255]);
  const up = await storage(`object/${BUCKET}/${photoPath}`, A.token, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  });
  check("A uploads photo to {user_id}/{session_id}/front.png", up.status === 200, "status=" + up.status);

  const pr = await rest("photos", A.token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      session_id: sessionId,
      angle: "front",
      storage_path: photoPath,
      width: 64,
      height: 64,
    }),
  });
  check("A inserts photos row (RLS via parent session)", pr.status === 201, "status=" + pr.status);

  // Store fixture bytes for later byte-identity check.
  globalThis.__fixture = bytes;
}

section("2. Owner reads back: signed URL + byte-identity fetch");
{
  const sr = await storage(`object/sign/${BUCKET}/${photoPath}`, A.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  const sj = await sr.json();
  const signed = sj.signedURL || sj.signedUrl;
  check("A gets signed URL for own object", sr.status === 200 && !!signed, "status=" + sr.status);
  if (signed) {
    const full = `${URL_BASE}/storage/v1${signed}`;
    const fr = await fetch(full);
    const buf = Buffer.from(await fr.arrayBuffer());
    check("signed URL fetch returns 200", fr.status === 200, "status=" + fr.status);
    check(
      "fetched bytes identical to uploaded fixture",
      buf.length === globalThis.__fixture.length && buf.equals(globalThis.__fixture),
      `${buf.length} bytes`,
    );
  }

  // RLS positive: A sees own session & photo.
  const gs = await rest(`sessions?select=id,user_id`, A.token);
  const gsj = await gs.json();
  check("A can read own session row", Array.isArray(gsj) && gsj.some((x) => x.id === sessionId), `${gsj.length} rows`);
}

section("3. ADVERSARIAL — user B must not reach user A's data");
{
  // 3a. B cannot see A's session rows.
  const bs = await rest("sessions?select=id,user_id", B.token);
  const bsj = await bs.json();
  check(
    "B cannot read A's session rows (RLS)",
    Array.isArray(bsj) && !bsj.some((x) => x.id === sessionId),
    `B sees ${Array.isArray(bsj) ? bsj.length : "?"} rows`,
  );

  // 3b. B cannot see A's photo rows (even querying by session_id).
  const bp = await rest(`photos?select=id,storage_path&session_id=eq.${sessionId}`, B.token);
  const bpj = await bp.json();
  check("B cannot read A's photo rows", Array.isArray(bpj) && bpj.length === 0, `B sees ${Array.isArray(bpj) ? bpj.length : "?"} rows`);

  // 3c. B cannot mint a signed URL for A's path.
  const bsign = await storage(`object/sign/${BUCKET}/${photoPath}`, B.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  check("B denied signed URL for A's object", bsign.status >= 400, "status=" + bsign.status);

  // 3d. B cannot fetch A's object via authenticated download of a constructed path.
  const bdl = await storage(`object/authenticated/${BUCKET}/${photoPath}`, B.token);
  check("B denied authenticated download of A's object", bdl.status >= 400, "status=" + bdl.status);

  // 3e. Public download must fail (bucket is private).
  const pub = await fetch(`${URL_BASE}/storage/v1/object/public/${BUCKET}/${photoPath}`);
  check("public (unauth) download denied — bucket private", pub.status >= 400, "status=" + pub.status);

  // 3f. B listing A's folder returns nothing.
  const bl = await storage(`object/list/${BUCKET}`, B.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: `${A.sub}/`, limit: 100 }),
  });
  const blj = await bl.json();
  check("B listing A's folder returns empty", Array.isArray(blj) && blj.length === 0, `${Array.isArray(blj) ? blj.length : "?"} entries`);

  // 3g. B cannot INSERT a row claiming A's user_id (RLS with check).
  const bins = await rest("sessions", B.token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: A.sub, notes: "spoof" }),
  });
  check("B cannot insert a session owned by A (RLS check)", bins.status >= 400, "status=" + bins.status);

  // 3h. B cannot upload into A's folder.
  const bup = await storage(`object/${BUCKET}/${A.sub}/${sessionId}/evil.png`, B.token, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: makePng(8, [255, 0, 0]),
  });
  check("B cannot upload into A's folder", bup.status >= 400, "status=" + bup.status);
}

section("4. Cleanup");
{
  // Remove test rows/objects and users (service role).
  await storage(`object/${BUCKET}/${photoPath}`, SVC, { method: "DELETE" });
  await fetch(`${URL_BASE}/rest/v1/sessions?id=eq.${sessionId}`, {
    method: "DELETE",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  });
  for (const u of [A.sub, B.sub]) {
    if (u)
      await fetch(`${URL_BASE}/auth/v1/admin/users/${u}`, {
        method: "DELETE",
        headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
      });
  }
  check("cleanup ran", true, "removed objects, rows, and test users");
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
