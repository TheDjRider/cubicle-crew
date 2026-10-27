// Светлина и цветово степенуване по часа (color grade, като Graveyard Keeper): ръчно настроени „кадри“
// за всяка част от деня (нощ, зазоряване, утро, пладне, златен час, синьо време), смесени плавно по реалното време.
// Сцената се рисува нормално, после: обезцветяване + оттенък (soft-light) -> умножение по КАРТА НА СВЕТЛИНАТА
// (околна светлина + петна там, където пада светлина) -> малко адитивен ореол. Нощем стаята е тъмна и
// се вижда само там, където свети нещо (монитор, лампа, луна през прозореца).
import { CFG } from './config.js';
import { mix, rgba } from './palette.js';
import { R, makeCanvas } from './util.js';

// час, околна светлина (multiply), оттенък (soft-light), сила на оттенъка, обезцветяване, цвят на слънцето, сила на слънцето
const GRADES = [
  [0, '#252b5c', '#1c2c74', 0.32, 0.34, '#000000', 0],
  [4.7, '#282c60', '#262e74', 0.32, 0.32, '#000000', 0],
  [5.9, '#76598e', '#ff5a86', 0.30, 0.16, '#ff8a7a', 0.3],   // зазоряване: розово-лилаво
  [6.9, '#d2a09a', '#ff9466', 0.28, 0.05, '#ffb27a', 0.85],  // изгрев: праскова
  [8.6, '#d6d9ea', '#94c0ff', 0.13, 0, '#ffecc4', 0.7],      // утро: свежо, хладно
  [12.5, '#dedde0', '#fff2dc', 0.06, 0, '#ffeebe', 0.6],    // пладне: неутрално
  [16.2, '#e2d2c2', '#ffc484', 0.15, 0, '#ffd890', 0.75],     // следобед: затопля се
  [18.2, '#e6a87c', '#ff8434', 0.34, 0, '#ffa04c', 1],       // златен час
  [19.2, '#9c7698', '#d04a7c', 0.28, 0.06, '#ff6e58', 0.4],  // залез -> магента
  [20.1, '#545a9c', '#3448b4', 0.32, 0.16, '#000000', 0],    // синьо време
  [21.3, '#252b5c', '#1c2c74', 0.32, 0.34, '#000000', 0],
  [24, '#252b5c', '#1c2c74', 0.32, 0.34, '#000000', 0],
];

/** Степенуването за часа (+ времето навън и лампите на тавана). lit 0..1. */
export function gradeOf(tod, lit = 0, s = 1) {
  const h = tod.h;
  let i = 0;
  while (i < GRADES.length - 2 && GRADES[i + 1][0] <= h) i++;
  const A = GRADES[i], B = GRADES[i + 1];
  let k = (h - A[0]) / (B[0] - A[0] || 1);
  k = k * k * (3 - 2 * k); // плавно и в краищата на прехода
  const n = nightOf(tod);
  let amb = mix(A[1], B[1], k), tone = mix(A[2], B[2], k);
  let toneK = A[3] + (B[3] - A[3]) * k, desat = A[4] + (B[4] - A[4]) * k;
  const sunC = A[6] === 0 ? B[5] : B[6] === 0 ? A[5] : mix(A[5], B[5], k);
  let sun = A[6] + (B[6] - A[6]) * k;
  // облачно / дъжд: по-сиво, по-плоско, без слънчеви петна
  const wx = tod.wx;
  if (wx) {
    const c = Math.min(1, wx.cover + wx.fog * 0.5 + (wx.rain ? 0.2 : 0));
    amb = mix(amb, mix('#a4a8b8', '#2a2c48', n), c * 0.4 * (1 - n * 0.5));
    toneK *= 1 - c * 0.5; desat += c * 0.18;
    tone = mix(tone, '#7a88b0', c * 0.5);
  }
  sun *= tod.sunny ?? 1;
  // лампите на тавана: стаята е светла и топла, но ъглите остават в сянка (петната идват от картата)
  const room = lit * n;
  if (room > 0.01) { amb = mix(amb, '#8a7c80', room * 0.85); desat *= 1 - room * 0.6; toneK *= 1 - room * 0.45; }
  // ризите носят състоянието: обезцветяването е ограничено, а „Атмосфера“ (s) го смесва към неутрално
  desat = Math.min(desat, 0.2) * s; toneK *= s; amb = mix('#ffffff', amb, s);
  return { amb, tone, toneK, desat, sunC, sun: sun * (0.4 + 0.6 * s), n: n * s, lit: room };
}

/** 0..1 колко е нощ за осветлението (като nightK в environment.js). */
export function nightOf(tod) { return Math.min(1, tod.night * 1.6); }

// ---------------------------------------------------------------- слънчеви петна
/** Къде пада слънцето през всеки прозорец: редове [y, x0, x1, сила] по пода (с летвите на рамката като сянка).
 *  Височина и посока на слънцето по часа: сутрин дълго петно надясно, по обед късо до стената, вечер дълго наляво. */
export function sunPatches(room, tod) {
  const h = tod.h;
  if (h < 6 || h > 19.8 || !room.windows.length) return null;
  const el = Math.sin(Math.PI * (h - 6) / 13.8) * 62 * Math.PI / 180; // ъгъл над хоризонта
  if (el < 0.05) return null;
  const c = Math.min(2.4, 0.95 / Math.tan(el));         // колко px под на 1 px височина (перспектива 0.95)
  const tz = Math.max(-1.05, Math.min(1.05, (12.9 - h) * 0.17)); // отместване на ред (азимут)
  const y0 = CFG.WALL_H, yMax = room.H - 6;
  const out = [];
  for (const w of room.windows) {
    const gx0 = w.x + 2, gx1 = w.x + w.w - 2, mx = w.x + Math.floor(w.w / 2);
    const top = w.y + 1, bot = w.y + w.h - 1;
    const bars = [Math.round(w.h * 0.34), Math.round(w.h * 0.67)].map((b) => w.y + b);
    const rows = [];
    const dMax = (y0 - top) * c;
    for (let y = y0 + 1; y < Math.min(yMax, y0 + dMax); y++) {
      const d = y - y0, ry = Math.round(y0 - d / c); // кой ред на стъклото свети тук
      if (ry < top || ry >= bot) continue;
      if (bars.some((b) => ry >= b && ry < b + 2)) continue; // летвите хвърлят сянка
      const sx = Math.round(d * tz);
      const f = 1 - 0.55 * (d / dMax); // далечният край е по-блед
      const s = f > 0.78 ? 1 : f > 0.6 ? 0.8 : 0.62;    // на стъпала, не гладко
      rows.push([y, gx0 + sx, mx - 1 + sx, s]);
      rows.push([y, mx + 1 + sx, gx1 + sx, s]);
    }
    out.push({ w, rows, tz, c, len: Math.min(yMax - y0, dMax) });
  }
  return out;
}

/** Петната в картата на светлината (адитивно). */
export function drawSunPatches(g, patches, color, a) {
  if (!patches || a < 0.01) return;
  for (const p of patches) for (const [y, x0, x1, s] of p.rows) {
    if (x1 <= x0) continue;
    g.fillStyle = rgba(color, a * s); g.fillRect(x0, y, x1 - x0, 1);
    // мек ръб: по 1 px по-слабо от двете страни (полусянка)
    g.fillStyle = rgba(color, a * s * 0.45); g.fillRect(x0 - 1, y, 1, 1); g.fillRect(x1, y, 1, 1);
  }
}

/** Лъчът във въздуха между прозореца и петното (много слаб, адитивно). */
export function drawSunBeams(ctx, patches, color, a) {
  if (!patches || a < 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of patches) {
    const w = p.w, y0 = CFG.WALL_H, y1 = y0 + p.len, sx = Math.round(p.len * p.tz);
    const gr = ctx.createLinearGradient(0, w.y, 0, y1);
    gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.45, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(w.x + 2, w.y + 4); ctx.lineTo(w.x + w.w - 2, w.y + 4);
    ctx.lineTo(w.x + w.w - 2 + sx, y1); ctx.lineTo(w.x + 2 + sx, y1);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** Произволна точка в лъча (за прашинките). */
export function beamPoint(patches) {
  if (!patches?.length) return null;
  const p = patches[Math.floor(Math.random() * patches.length)];
  const t = Math.random();
  const y = Math.round(p.w.y + 6 + t * (CFG.WALL_H + p.len * 0.8 - p.w.y - 6));
  const d = Math.max(0, y - CFG.WALL_H);
  return { x: p.w.x + 3 + Math.random() * (p.w.w - 6) + d * p.tz * (t > 0.5 ? 1 : t * 2), y };
}

// ---------------------------------------------------------------- отражения на мокрия под
/** Когато вали: под всеки прозорец по пода трепти студено отражение на стъклото (вертикални ивици на стъпала). */
export function drawWetReflections(ctx, room, tod, now) {
  const wx = tod.wx;
  if (!wx || !(wx.rain > 0 || wx.storm)) return;
  const y0 = CFG.WALL_H + 1, len = 18;
  const c = mix(mix(tod.skyBottom, '#c8d8ff', 0.5), '#5a6aa8', tod.night * 0.5);
  const fr = Math.floor(now / 300);
  const a0 = (0.13 + 0.07 * (wx.rain || 0.5)) * (1 - tod.night * 0.4);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const w of room.windows) {
    const mx = w.x + Math.floor(w.w / 2);
    for (let x = w.x + 2; x < w.x + w.w - 2; x++) {
      if (x === mx || x === mx - 1) continue; // летвата
      // ивици по 2 px, дължината трепти бавно (вълнички по мокрия под)
      const b = x >> 1, hs = ((b * 73 + (b % 3 === 0 ? fr : 0) * 31) % 17) / 17;
      const l = Math.round(len * (0.4 + 0.6 * hs));
      const s1 = Math.round(l * 0.35), s2 = Math.round(l * 0.7);
      ctx.fillStyle = rgba(c, a0); ctx.fillRect(x, y0, 1, s1);
      ctx.fillStyle = rgba(c, a0 * 0.6); ctx.fillRect(x, y0 + s1, 1, s2 - s1);
      ctx.fillStyle = rgba(c, a0 * 0.3); ctx.fillRect(x, y0 + s2, 1, l - s2);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- платна
let tmpCache = null;
/** Пълноекранна стъпка на степенуването: обезцветяване + оттенък. */
export function applyGrade(ctx, W, H, G) {
  ctx.save();
  if (G.desat > 0.01) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = `rgba(128,128,128,${Math.min(0.9, G.desat)})`; ctx.fillRect(0, 0, W, H); }
  if (G.toneK > 0.01) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = rgba(G.tone, Math.min(1, G.toneK)); ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}
/** Платно за картата на светлината (едно, преизползва се). */
export function lightCanvas(W, H) {
  if (!tmpCache || tmpCache.width !== W || tmpCache.height !== H) tmpCache = makeCanvas(W, H);
  return tmpCache;
}

