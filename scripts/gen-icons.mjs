import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// Minimal PNG encoder — brand-colored icon with a lighter "M" mark, no deps.
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
function png(size) {
  const bg = [13, 14, 18];
  const fg = [110, 168, 254];
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const o = y * (size * 3 + 1) + 1 + x * 3;
      const d = Math.hypot(x - cx, y - cy);
      // Simple stylized mark: a ring.
      const inRing = d < r && d > r * 0.62;
      const col = inRing ? fg : bg;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const s of [192, 512]) {
  writeFileSync(
    new URL(`../public/icons/icon-${s}.png`, import.meta.url),
    png(s),
  );
  console.log("wrote icon-" + s + ".png");
}
