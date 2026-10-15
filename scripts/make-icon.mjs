// Генерира build/icon.png (256x256) и build/icon.ico (16, 32, 48, 64, 128, 256) от electron/icon-art.js.
// Малките размери (16, 48) идват от рисунката 16x16, големите – от 32x32, винаги с цяло число мащаб.
// Пусни: node scripts/make-icon.mjs   (без външни пакети – собствен PNG/ICO енкодер с zlib)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { drawIcon16, drawIcon32 } from '../electron/icon-art.js';

/** RGBA буфер size x size: рисунката с мрежа grid, мащабирана по K = size/grid. */
function render(size) {
  const grid = size % 32 === 0 && size >= 32 && size !== 48 ? 32 : 16;
  const K = Math.max(1, Math.floor(size / grid)), off = Math.floor((size - grid * K) / 2);
  const px = new Uint8Array(size * size * 4);
  const rect = (x, y, w, h, [r, g, b, a = 255]) => {
    for (let j = y * K; j < (y + h) * K; j++) for (let i = x * K; i < (x + w) * K; i++) {
      const o = ((j + off) * size + i + off) * 4, sa = a / 255, da = px[o + 3] / 255, oa = sa + da * (1 - sa);
      if (oa <= 0) continue;
      px[o] = Math.round((r * sa + px[o] * da * (1 - sa)) / oa);
      px[o + 1] = Math.round((g * sa + px[o + 1] * da * (1 - sa)) / oa);
      px[o + 2] = Math.round((b * sa + px[o + 2] * da * (1 - sa)) / oa);
      px[o + 3] = Math.round(oa * 255);
    }
  };
  (grid === 32 ? drawIcon32 : drawIcon16)(rect);
  return px;
}

// --- PNG ---
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(size) {
  const px = render(size);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8 бита, RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// --- ICO (PNG записи, Windows Vista+) ---
function ico(sizes) {
  const imgs = sizes.map(png);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += imgs[i].length;
  });
  return Buffer.concat([head, ...imgs]);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), png(256));
fs.writeFileSync(path.join(dir, 'icon.ico'), ico([16, 32, 48, 64, 128, 256]));
// macOS иска поне 512 px (electron-builder прави .icns от него)
fs.writeFileSync(path.join(dir, 'icon-mac.png'), png(1024));
// ?preview: всички размери един до друг (x4 за малките) – за преглед
if (process.argv.includes('--preview')) {
  const out = process.argv[process.argv.indexOf('--preview') + 1];
  for (const s of [16, 32, 48, 64, 256]) fs.writeFileSync(`${out}-${s}.png`, png(s));
}
console.log('icon:', dir);
