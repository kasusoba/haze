// Render Haze's ◐ mark to the toolbar/store PNG icons in the brand accent.
// Dependency-free: draws the glyph with supersampled coverage and hand-encodes
// PNG (Chrome MV3 needs raster icons, not SVG). Source of truth: icon.svg.
//
// Run: `node scripts/make-icons.mjs`

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ACCENT = [0xf0, 0xa2, 0x3c]; // --accent #f0a23c
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling per axis for antialiasing

// ◐ — left half filled, right half an open ring — in accent on transparency.
function coverage(x, y, size) {
  const c = size / 2;
  const R = size * 0.42; // outer radius
  const w = Math.max(1.4, size * 0.11); // ring / stroke width
  let hit = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const dx = x + (sx + 0.5) / SS - c;
      const dy = y + (sy + 0.5) / SS - c;
      const dist = Math.hypot(dx, dy);
      if (dist <= R && (dx <= 0 || dist >= R - w)) hit++;
    }
  }
  return hit / (SS * SS);
}

// --- minimal PNG (RGBA, no filter) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const a = Math.round(coverage(x, y, size) * 255);
      raw[o++] = ACCENT[0];
      raw[o++] = ACCENT[1];
      raw[o++] = ACCENT[2];
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = fileURLToPath(new URL("../public/icon", import.meta.url));
for (const size of SIZES) {
  writeFileSync(`${outDir}/${size}.png`, encodePng(size));
  console.log(`Wrote public/icon/${size}.png`);
}
