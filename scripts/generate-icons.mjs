// Generates the PNG app icons from a small procedural drawing.
//
// Dependency-free: pixels are composed in a raw RGBA buffer and encoded to PNG
// using only Node's built-in `zlib`. Re-run with `npm run icons` if the brand
// artwork changes.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');

// --- tiny PNG encoder -------------------------------------------------------

const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing ----------------------------------------------------------------

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const bgTop = hex('#0f1626');
  const bgBot = hex('#070a12');
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  // vertical gradient background
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const col = [
      Math.round(bgTop[0] + (bgBot[0] - bgTop[0]) * t),
      Math.round(bgTop[1] + (bgBot[1] - bgTop[1]) * t),
      Math.round(bgTop[2] + (bgBot[2] - bgTop[2]) * t),
    ];
    for (let x = 0; x < size; x++) set(x, y, col);
  }
  // stacked blocks (coordinates in a 512 grid, scaled to size)
  const s = size / 512;
  const blocks = [
    [140, 300, '#2bb8a3'], [220, 300, '#2bb8a3'], [300, 300, '#2bb8a3'],
    [180, 220, '#f4c333'], [260, 220, '#f4c333'],
    [220, 140, '#e06fc0'],
  ];
  const bs = Math.round(80 * s);
  const border = hex('#04121a');
  for (const [bx, by, color] of blocks) {
    const col = hex(color);
    const px = Math.round(bx * s);
    const py = Math.round(by * s);
    for (let y = 0; y < bs; y++) {
      for (let x = 0; x < bs; x++) {
        const edge = x < 3 || y < 3 || x >= bs - 3 || y >= bs - 3;
        set(px + x, py + y, edge ? border : col);
      }
    }
  }
  return buf;
}

for (const size of [192, 512]) {
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), encodePng(size, size, draw(size)));
}
writeFileSync(join(OUT_DIR, 'apple-touch-icon.png'), encodePng(180, 180, draw(180)));
console.log('Icons written to', OUT_DIR);
