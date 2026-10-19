// Прожекционен екран над дъската: клик върху дъската -> екранът се спуска и показва статистиката
// (днес -> 7 дни -> 30 дни), следващият клик го навива обратно. Данните: GET /api/stats?days=30 (stats.js);
// в ?demo – измислени. Само цифри и икони в сцената; думите са в подсказката (ui.js).
import { STATES } from './config.js';
import { R } from './util.js';
import { drawText, textWidth } from './pixelfont.js';
import { glow } from './environment.js';

export const BOARD_PAGES = 4;            // 0 = живата дъска, 1 = днес, 2 = 7 дни, 3 = 30 дни
export const PAGE_DAYS = [0, 1, 7, 30];
const ROLL_DOWN = 450, ROLL_UP = 380, SLIDE = 300, FADE = 220;
const ACTIVE = ['thinking', 'typing', 'reading', 'running', 'delegating'];

const ease = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.pow(1 - p, 3));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Отговорът на /api/stats (days[0] = днес) -> { 1: {...}, 7: {...}, 30: {...} }. */
export function boardData(days) {
  const out = {};
  for (const n of [1, 7, 30]) {
    const part = days.slice(0, n);
    const t = { activeMs: 0, waitingMs: 0, tools: 0, tokIn: 0, tokOut: 0, usd: 0, ms: {}, series: [] };
    for (const d of part) {
      const x = d.total;
      t.activeMs += x.activeMs; t.waitingMs += x.waitingMs; t.tools += x.tools; t.tokIn += x.tokIn; t.tokOut += x.tokOut; t.usd += x.usd || 0;
      for (const [k, v] of Object.entries(x.ms || {})) t.ms[k] = (t.ms[k] || 0) + v;
    }
    // стълбчетата: най-старият ден вляво
    t.series = part.map((d) => [d.total.activeMs, d.total.waitingMs]).reverse();
    while (t.series.length < n) t.series.unshift([0, 0]);
    out[n] = t;
  }
  return out;
}

/** Примерни данни за ?demo (детерминирани). */
export function demoBoardData() {
  let s = 11;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const H = 3600000, days = [];
  for (let i = 0; i < 30; i++) {
    const w = i === 0 ? 0.6 : (i % 7 === 5 || i % 7 === 6) ? 0.15 + 0.2 * r() : 0.6 + 0.6 * r();
    const ms = { thinking: 1.6 * w * H, typing: 0.9 * w * H, reading: 0.8 * w * H, running: 1.3 * w * H, delegating: 0.5 * w * H, waiting: (0.2 + 0.25 * r()) * w * H };
    days.push({ total: { activeMs: ACTIVE.reduce((a, k) => a + ms[k], 0), waitingMs: ms.waiting, tools: Math.round(700 * w), tokIn: Math.round(2000 * w), tokOut: Math.round(260000 * w), usd: 14 * w, ms } });
  }
  return boardData(days);
}

/** Часове:минути („6:14“, „84:30“). */
export const hm = (ms) => { const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
/** Токени накратко: 950, 3.2k, 332k, 1.2M, 18M. */
export function tokShort(n) {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e4) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (n < 1e6) return Math.round(n / 1000) + 'k';
  if (n < 1e7) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  return Math.round(n / 1e6) + 'M';
}

const ICON = {
  work: ['.111.', '1.1.1', '1.11.', '1...1', '.111.'],      // часовник
  wait: ['11111', '.1.1.', '..1..', '.1.1.', '11111'],      // пясъчен часовник
  tools: ['..11.', '.11..', '1111.', '..11.', '.11..'],     // гаечен ключ
  tok: ['..1..', '.111.', '11111', '.111.', '..1..'],       // „токен“
};
function icon(ctx, rows, x, y, c) {
  ctx.fillStyle = c;
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') ctx.fillRect(x + i, y + j, 1, 1); });
}

/** Една страница от прожекцията в правоъгълника x,y,w,h (вътрешността на екрана). */
function drawPage(ctx, x, y, w, h, page, data) {
  const n = PAGE_DAYS[page], d = data?.[n];
  const ink = '#2a2436';
  // ляво: четирите числа
  const rows = [
    [ICON.work, '#3a9a5a', d ? hm(d.activeMs) : '--'],
    [ICON.wait, '#d04a6a', d ? hm(d.waitingMs) : '--'],
    [ICON.tools, '#d0663a', d ? tokShort(d.tools) : '--'],
    [ICON.tok, '#8a4ad0', d ? tokShort(d.tokOut) : '--'],
  ];
  rows.forEach(([ic, c, v], i) => { const ry = y + 2 + i * 7; icon(ctx, ic, x + 2, ry, c); drawText(ctx, v, x + 9, ry, ink); });
  // горе вдясно: календарче с броя дни
  const num = String(n), bw = textWidth(num) + 4, bx = x + w - bw - 2, by = y + 2;
  R(ctx, '#c84a4a', bx, by, bw, 2); R(ctx, '#ffffff', bx, by + 2, bw, 7); R(ctx, '#c8c4bc', bx, by + 9, bw, 1);
  drawText(ctx, num, bx + 2, by + 3, ink);
  // графиката
  const cx = x + 36, cw = w - 38, cy = y + 12, ch = h - 14;
  R(ctx, '#d8d4cc', cx, cy + ch, cw, 1);
  if (!d) return;
  if (page === 1) {
    // днес: по едно хоризонтално стълбче за всяко състояние
    const keys = [...ACTIVE, 'waiting'], max = Math.max(1, ...keys.map((k) => d.ms[k] || 0));
    keys.forEach((k, i) => { const len = Math.round(((d.ms[k] || 0) / max) * cw); if (len > 0) R(ctx, STATES[k].color, cx, cy + i * 3 - 1, len, 2); });
  } else {
    // дни: работа (зелено) + чакане за теб (червено) отгоре
    const s = d.series, bw2 = s.length <= 7 ? 3 : 1, gap = s.length <= 7 ? 1 : 0;
    const max = Math.max(1, ...s.map(([a, q]) => a + q));
    s.forEach(([a, q], i) => {
      const bx2 = cx + i * (bw2 + gap), ha = Math.round((a / max) * ch), hq = Math.round((q / max) * ch);
      if (ha) R(ctx, i === s.length - 1 ? '#5ad08a' : '#3a9a5a', bx2, cy + ch - ha, bw2, ha);
      if (hq) R(ctx, '#d04a6a', bx2, cy + ch - ha - hq, bw2, hq);
    });
  }
}

/** Докъде е спуснат екранът (0..1) в момента. */
function extentOf(bs, now) {
  const t = now - bs.at;
  if (bs.page > 0 && bs.prev === 0) return ease(t / ROLL_DOWN);
  if (bs.page === 0 && bs.prev > 0) return 1 - ease(t / ROLL_UP);
  return bs.page > 0 ? 1 : 0;
}

/** Кутията на екрана над дъската, самият екран и прожекцията. bs = { page, prev, at }. */
export function drawBoardScreen(ctx, room, bs, data, now) {
  const b = room.board;
  if (!b || !bs) return;
  const x = b.x - 2, w = b.w + 4, top = b.y - 2, full = b.h + 5;
  // кутията (навит екран) винаги стои над дъската
  R(ctx, '#2a2436', x - 1, top - 3, w + 2, 3); R(ctx, '#5a5468', x - 1, top - 3, w + 2, 1); R(ctx, '#1a1420', x - 2, top - 3, 1, 3); R(ctx, '#1a1420', x + w + 1, top - 3, 1, 3);
  const ext = extentOf(bs, now), h = Math.round(full * ext);
  if (h <= 0) { R(ctx, '#3a3448', x + w / 2 - 1, top, 2, 2); return; } // дръжката
  R(ctx, '#c8c4bc', x, top, w, h); R(ctx, '#f4f2ea', x + 1, top, w - 2, h - 1);
  R(ctx, '#2a2436', x, top + h - 1, w, 1); R(ctx, '#3a3448', x + w / 2 - 1, top + h, 2, 2);
  if (ext < 1 || bs.page === 0) return;
  // прожекцията: след спускане се появява; между страниците се плъзга наляво
  const ix = x + 2, iy = top + 1, iw = w - 4, ih = h - 3, t = now - bs.at;
  ctx.save();
  ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  if (bs.prev > 0 && t < SLIDE) {
    const off = Math.round(ease(t / SLIDE) * iw);
    drawPage(ctx, ix - off, iy, iw, ih, bs.prev, data);
    drawPage(ctx, ix + iw - off, iy, iw, ih, bs.page, data);
  } else {
    const a = bs.prev === 0 ? clamp01((t - ROLL_DOWN) / FADE) : 1;
    ctx.globalAlpha = a < 1 ? (Math.floor(t / 40) % 2 ? a : a * 0.5) : 1; // лампата на проектора загрява
    drawPage(ctx, ix, iy, iw, ih, bs.page, data);
  }
  ctx.restore();
}

/** Светлината на проектора върху екрана (режим 'lighter'). */
export function boardGlow(ctx, room, bs, now, night) {
  const b = room.board;
  if (!b || !bs || extentOf(bs, now) < 0.99 || bs.page === 0) return;
  glow(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.7, '#e8f0ff', 0.06 + 0.22 * night);
}

/** Дали екранът се движи (за адаптивните FPS в office.animating). */
export function boardMoving(bs, now) { return now - bs.at < ROLL_DOWN + FADE + 60; }
