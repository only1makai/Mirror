// Seeds two real capture sessions (30 days apart) with real photos for a given
// email, so Compare + ghost overlay can be verified in the live UI.
// Uses service_role to write on the user's behalf (objects land under the
// user's own folder, so the app reads them normally under RLS).
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

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
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.argv[2];
if (!EMAIL) {
    console.error("Usage: node scripts/seed-compare.mjs <email>");
    process.exit(1);
}
const BUCKET = "photos";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
// A "portrait-ish" placeholder: bg color + a lighter oval, shifted per angle.
function makePng(w, h, bg, fg, cxFrac) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  const cx = w * cxFrac;
  const cy = h * 0.42;
  const rx = w * 0.26;
  const ry = h * 0.3;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      const col = d < 1 ? fg : bg;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}` };

async function getUserId(email) {
  const r = await fetch(
    `${URL_BASE}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: svcHeaders },
  );
  const j = await r.json();
  const u = (j.users || []).find((x) => x.email === email);
  return u?.id;
}

const userId = await getUserId(EMAIL);
if (!userId) {
  console.error("No user for", EMAIL, "- sign in once first.");
  process.exit(1);
}
console.log("User:", EMAIL, userId);

const ANGLES = ["front", "left", "right"];
const cxByAngle = { front: 0.5, left: 0.62, right: 0.38 };
const W = 480,
  H = 640;

// Two sessions: older (30d ago) muted teal, newer (today) warmer tone.
const sessions = [
  { daysAgo: 30, bg: [26, 40, 44], fg: [70, 120, 120], lighting: 96 },
  { daysAgo: 0, bg: [44, 34, 28], fg: [150, 120, 95], lighting: 121 },
];

for (const s of sessions) {
  const capturedAt = new Date(Date.now() - s.daysAgo * 86400000).toISOString();
  // Insert session (service_role bypasses RLS; user_id set explicitly).
  const sr = await fetch(`${URL_BASE}/rest/v1/sessions`, {
    method: "POST",
    headers: {
      ...svcHeaders,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: userId,
      captured_at: capturedAt,
      lighting_score: s.lighting,
      notes: `seed ${s.daysAgo}d`,
    }),
  });
  const sj = await sr.json();
  const sessionId = sj[0].id;
  console.log(`session ${s.daysAgo}d ago -> ${sessionId} (status ${sr.status})`);

  for (const angle of ANGLES) {
    const bytes = makePng(W, H, s.bg, s.fg, cxByAngle[angle]);
    const path = `${userId}/${sessionId}/${angle}.png`;
    const up = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { ...svcHeaders, "Content-Type": "image/png", "x-upsert": "true" },
      body: bytes,
    });
    const pr = await fetch(`${URL_BASE}/rest/v1/photos`, {
      method: "POST",
      headers: {
        ...svcHeaders,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        session_id: sessionId,
        angle,
        storage_path: path,
        width: W,
        height: H,
      }),
    });
    console.log(`  ${angle}: upload ${up.status}, row ${pr.status}`);
  }
}
console.log("Seed complete.");
