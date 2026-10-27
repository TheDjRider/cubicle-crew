// ?gl: какво свети в сцената този кадър – точкови светлини в света (x, дълбочина, височина), слънце/луна,
// околна светлина и цветова корекция по часа; маска на светещите пиксели; статични подсказки за повърхностите.
import { CFG, STATES } from '../config.js';
import { POD } from '../layout.js';
import { nightK } from '../environment.js';
import { flashAt } from '../weather.js';
import { prefs } from '../prefs.js';
import { neonFlicker } from '../office.js';

const rgb = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const lin = (hex) => rgb(hex).map((v) => v ** 2.2);
const mixv = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const scale = (a, k) => a.map((v) => v * k);

const WARM = lin('#ffd49a'), TUBE = lin('#ffe6c4'), LAMP = lin('#ffc878');

/** Точка на екрана (sx, sy), чиято „стъпка“ на пода е на дълбочина d -> позиция в света. */
const at = (sx, sy, d) => ({ x: sx, y: d, z: Math.max(0, d - sy) });

export function sceneParams(office, tod, lit, now, occupant, sky) {
  const room = office.room, L = office.L, lo = L.lounge, WH = CFG.WALL_H;
  const n0 = nightK(tod), day = tod.daylight, warm = tod.warm, sunny = tod.sunny ?? 1, cover = tod.cover || 0;
  // мрачно (облаци, дъжд) -> хората палят лампите и денем: уютният контраст топло вътре / сиво навън
  const gloom = Math.min(1, cover * 0.7 + (tod.wx?.rain || 0) * 0.3) * day;
  const n = Math.max(n0, gloom * 0.55);
  const lights = [];
  const add = (p, r, c, i, sh = false) => { if (i > 0.003) lights.push({ ...p, r, c, i, sh }); };

  // таванните лампи (над средата на стаята, високо) – хвърлят сенки
  const ceilI = lit * (0.1 + 0.75 * n0 + 0.3 * gloom);
  for (const x of room.ceil || []) add({ x, y: WH + 92, z: 110 }, 220, TUBE, ceilI); // без сенки: тръбите са разсеяни (и сенките на бюрата отпред изглеждаха като ивици)
  // прозорците пускат мека светлина от небето (без сенки)
  const skyC = lin(tod.skyBottom);
  for (const w of room.windows) add({ x: w.x + w.w / 2, y: WH + 6, z: WH - (w.y + w.h * 0.55) }, 175, mixv(skyC, [1, 1, 1], 0.4), 0.6 * day * (0.6 + 0.4 * sunny));

  // работните места: мониторът в цвета на състоянието, настолната лампа
  for (const p of L.pods) {
    const a = occupant.get(p.i);
    const owner = a || [...office.actors.values()].find((x) => x.pod === p.i);
    if (!owner) continue;
    const st = a ? a.vstate : 'idle';
    const flick = 0.92 + 0.08 * Math.sin(now / 90 + p.i);
    const sx = p.x + POD.screen.x + POD.screen.w / 2, sy = p.y + POD.screen.y + POD.screen.h / 2;
    add(at(sx, sy, p.y + 46), 46, lin(STATES[st].color), (0.55 + 1.1 * n) * flick * (st === 'idle' ? 0.45 : 1));
    const bx = p.x + POD.bulb.x, by = p.y + POD.bulb.y;
    if (st === 'waiting') add(at(bx, by, p.y + 44), 52, lin(STATES.waiting.color), Math.floor(now / 320) % 2 === 0 ? 1.6 : 0.35);
    else if (a) add(at(bx + 2, by + 2, p.y + 44), 56, LAMP, 0.15 + 1.05 * n, true);
  }

  // зоната за почивка
  if (prefs.lamp && room.lampGlow) add(at(room.lampGlow.x, room.lampGlow.y + 2, lo.floorLamp.base - 2), 100, LAMP, 0.2 + 1.6 * n, true);
  if (room.neon && prefs.lamp) add(at(room.neon.x, room.neon.y + 4, WH + 3), 64, lin(room.neon.c), (0.45 + 0.9 * n) * (0.9 + 0.1 * Math.sin(now / 130)) * neonFlicker(now));
  if (room.aquarium) add(at(room.aquarium.x + 14, room.aquarium.y + 12, room.aquarium.key - 2), 44, lin('#4ab8f0'), 0.25 + 0.7 * n);
  if (room.arcade) add(at(room.arcade.x + 9, room.arcade.y + 12, room.arcade.key + 2), 36, lin('#a06ae0'), 0.3 + 0.7 * n);
  add(at(lo.counter.x + 14, lo.counter.base - 36, lo.counter.base + 1), 18, lin('#6ae0ff'), 0.4);
  add(at(L.door.x + 12, L.door.y - 6, WH + 2), 30, lin('#4ac26b'), 0.3 + 0.6 * n);
  const shred = room.shredder;
  if (shred && now - shred.chewAt > 0 && now - shred.chewAt < 4000) add(at(shred.x + 9, shred.base - 27, shred.base), 22, lin('#e0a44a'), 0.9);
  const se = room.season;
  if (se?.style === 'pumpkins') add(at(se.x + 9, se.base - 7, se.base), 30, lin('#ffb040'), 0.2 + 0.9 * n);
  else if (se?.style === 'tree') add(at(se.x + 15, se.base - 17, se.base), 36, lin(Math.floor(now / 700) % 2 ? '#ffd860' : '#ff8a8a'), 0.2 + 0.8 * n);
  for (const a of office.actors.values()) {
    if (a.loc.type === 'sofa' && a.mode === 'idleSpot' && a.sofaAct === 'game') add(at(a.x, a.y - 14, a.y + 2), 22, lin('#6ae08a'), (0.3 + 0.7 * n) * (0.85 + 0.15 * Math.sin(now / 70)));
  }
  const sw = room.lightSwitch;
  if (sw && lit < 0.5 && n > 0.05) add(at(sw.x + 2, sw.y + 5, WH + 1), 10, lin('#ff9a3a'), 0.8 * n);

  // слънцето (денем, топло вечер) или луната (нощем, студена) – през прозорците
  let sunDir = [0, -1, 1], sunCol = [0, 0, 0], skyMod = 1.4;
  if (tod.sun != null && day > 0.04 && sunny < 0.35) {
    // без слънце: разсеяната светлина от небето пада право през стъклата – меки петна, по които се стичат капките
    sunDir = norm([0, -1, 0.8]);
    sunCol = scale(mixv(lin(tod.skyBottom), [1, 1, 1], 0.5), 0.75 * day);
    skyMod = 3.2;
  } else if (tod.sun != null && day > 0.04) {
    const s = tod.sun; // 0 изгрев .. 1 залез
    const elev = (10 + 48 * Math.sin(Math.PI * s)) * Math.PI / 180;
    const az = Math.max(-0.8, Math.min(0.8, (0.5 - s) * 3)); // вечер слънцето е отляво -> петната вървят надясно, към дивана
    sunDir = norm([az, -1, Math.tan(elev)]);
    sunCol = scale(mixv(lin('#ffe8c0'), lin('#ffa850'), Math.min(1, warm * 1.3)), (1.9 + 1.4 * warm) * Math.min(1, day * 1.4) * sunny);
  } else if (tod.moon != null && n > 0.3 && cover < 0.85) {
    const m = tod.moon;
    sunDir = norm([(m - 0.5) * 1.2, -1, Math.tan((14 + 30 * Math.sin(Math.PI * m)) * Math.PI / 180)]);
    sunCol = scale(lin('#8aa4ff'), 0.55 * n * (1 - cover));
  }

  // околна светлина: от оттенъка на часа (същият, с който 2D рендерът оцветява сцената)
  const tint = lin(tod.tint);
  const ambK = (0.08 + 0.62 * day) * (1 - 0.3 * gloom);
  const ambSky = scale(mixv(tint, [1, 1, 1], 0.15 * day), ambK);
  const ambGround = scale(mixv(tint, lin('#c8a080'), 0.3), ambK * 0.7);

  // цветова корекция: ден – леко топло, златен час – оранжево, нощ – студени сенки
  const lift = [0.012 * n * 0.2, 0.012 * n * 0.5, 0.03 * n], gain = mixv([1.02, 1.0, 0.97], [1.06, 0.97, 0.86], warm);
  const g2 = mixv(gain, [0.97, 0.98, 1.04], n);
  const skyLum = 0.299 * rgb(tod.skyBottom)[0] + 0.587 * rgb(tod.skyBottom)[1] + 0.114 * rgb(tod.skyBottom)[2];
  void sky;
  return {
    wall: WH, lights: lights.sort((a, b) => b.i - a.i).slice(0, 40),
    ambSky, ambGround, sunDir, sunCol, skyLum,
    rim: mixv(scale(mixv(skyC, [1, 1, 1], 0.3), 0.9 * day), sunCol, 0.25).map((v, i) => v + lin('#ffd49a')[i] * 0.25 * n * lit),
    objFill: scale(mixv(lin('#8088c0'), lin('#ffd8a8'), 0.4 * lit), 0.2 * n0),
    spread: skyMod > 2 ? 0.2 : 0.035,
    shaft: skyMod > 2 ? 0.004 : 0.012 * (tod.sun != null ? 1 : 0.7), skyMod,
    emiK: 0.9 + 1.4 * n,
    flash: flashAt(tod.wx, now) * 0.35,
    refl: 0.35 + 0.35 * n + 0.4 * gloom,
    thresh: 0.85,
    bloom: 0.55 + 0.45 * n,
    expo: 1.08,
    sat: 1.06 + 0.04 * warm - 0.08 * n - 0.1 * gloom,
    contrast: 1.03 + 0.05 * n,
    vig: 0.22 + 0.3 * n,
    lift, gain: g2,
    time: now / 1000,
  };
}

function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }

/** Маска на светещото: r = целият пиксел свети (екрани, линиите за делегиране), g = само ярките пиксели (лампи, неон…). */
export function drawEmissive(cv, office, now, occupant) {
  const g = cv.getContext('2d'), room = office.room, L = office.L, lo = L.lounge;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  const full = (x, y, w, h, k = 1) => { g.fillStyle = `rgba(255,0,0,${k})`; g.fillRect(x, y, w, h); };
  const bright = (x, y, w, h, k = 1) => { g.fillStyle = `rgba(0,255,0,${k})`; g.fillRect(x, y, w, h); };
  const s = POD.screen;
  for (const p of L.pods) {
    const a = occupant.get(p.i);
    const owner = a || [...office.actors.values()].find((x) => x.pod === p.i);
    if (!owner) continue;
    full(p.x + s.x, p.y + s.y, s.w, s.h, a && a.vstate !== 'idle' ? 1 : 0.55);
    if (a) bright(p.x + POD.bulb.x - 4, p.y + POD.bulb.y - 4, 9, 8, 0.8);
  }
  if (prefs.lamp && room.lampGlow) bright(room.lampGlow.x - 6, room.lampGlow.y - 6, 13, 12);
  if (room.neon && prefs.lamp) bright(room.neon.x - 16, room.neon.y - 9, 32, 18, neonFlicker(now));
  if (room.aquarium) full(room.aquarium.x + 1, room.aquarium.y + 2, 26, 20, 0.35);
  if (room.arcade) full(room.arcade.x + 4, room.arcade.y + 8, 10, 8, 0.9);
  bright(L.door.x + 4, L.door.y - 10, 16, 8);
  bright(lo.counter.x, lo.counter.base - 42, lo.counter.w, 14, 0.6);
  if (room.digital) full(room.digital.x + 1, room.digital.y + 1, room.digital.w - 2, room.digital.h - 2, 0.7);
  for (const x of room.ceil || []) bright(x - 9, 0, 18, 3, office.lightLevel(now));
  if (room.season) bright(room.season.x, room.season.base - 36, 30, 36, 0.7);
  // линиите родител–дете и кръгът „чака“ – в цвета на състоянието, да се четат и на тъмно
  g.save(); office.drawLinks(g, now); g.restore();
  for (const a of office.actors.values()) {
    if (a.vstate === 'waiting' && a.isAtDesk(L)) {
      const p = L.pods[a.pod], k = (now % 1100) / 1100;
      g.strokeStyle = `rgba(255,0,0,${0.9 * (1 - k)})`; g.lineWidth = 1;
      g.beginPath(); g.ellipse(p.x + 36, p.y + 46, 30 + k * 10, 10 + k * 4, 0, 0, Math.PI * 2); g.stroke();
    }
  }
}

/** Статично (при нова подредба): r = хоризонтални повърхности (плотове), b = лъскавина на пода (килимите – матови). */
export function drawHint(cv, office) {
  const g = cv.getContext('2d'), L = office.L, lo = L.lounge, WH = CFG.WALL_H;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgb(0,0,150)'; g.fillRect(0, WH, cv.width, cv.height - WH);
  g.fillStyle = 'rgb(0,0,0)';
  for (const r of L.rugs) if (r.w > 0) g.fillRect(r.x, r.y, r.w, r.h);
  g.fillRect(lo.rug.x, lo.rug.y, lo.rug.w, lo.rug.h);
  // плотовете: бюрата, масичката, плотът на кафемашината
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgb(255,0,0)';
  const d = POD.desk;
  for (const p of L.pods) g.fillRect(p.x + d.x, p.y + d.y, d.w, d.top);
  g.fillRect(lo.table.x, lo.table.base - lo.table.h, lo.table.w, 5);
  g.globalCompositeOperation = 'source-over';
}
