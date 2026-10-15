// Подредба на стаята: колко бюра, в каква решетка и с какъв цял мащаб,
// така че стаята да запълва прозореца и да не изглежда нито празна, нито натъпкана.
import { CFG } from './config.js';

/** Геометрия ВЪТРЕ в едно работно място (спрямо горния ляв ъгъл на pod-а). */
export const POD = {
  seat: { x: 26, y: 40 },        // точка "стъпала" при седнал герой (спрайтът е 24x32 => горе-ляво = x-12, y-31)
  aisle: { x: 26, y: 15 },       // пътеката зад стола
  chair: { x: 14, y: 15, w: 24, h: 17 },
  desk: { x: 6, y: 30, w: 60, top: 8, front: 12 },
  monitor: { x: 40, y: 10, w: 22, h: 18 },
  screen: { x: 42, y: 12, w: 18, h: 13 },
  keyboard: { x: 18, y: 31, w: 16, h: 3 },
  lamp: { x: 6, y: 18 },
  bulb: { x: 13, y: 24 },
  bell: { x: 36, y: 33 },
  label: { x: 36, y: 51 },
  depthChair: 18, depthSeat: 24, depthDesk: 30,
};


/** Редове под-агенти на всеки екип: spec.rows е масив [екип 1, екип 2] (число = еднакво за всички – стар вид). */
export const teamRows = (spec) => (Array.isArray(spec.rows) ? spec.rows : Array(spec.teams).fill(spec.rows || 1)).slice(0, spec.teams);

/** Колко място иска дадена подредба на екипи (логически px). Общ килим: колоните са винаги SUB_PER_ROW,
 *  вторият екип добавя бюро до първото оркестраторско и свои редове отдолу – офисът расте надолу, не встрани. */
export function teamNeed(spec, podH = CFG.POD_H) {
  const rows = teamRows(spec).reduce((s, r) => s + r, 0);
  return {
    w: Math.max(CFG.MIN_W, CFG.MARGIN_L + CFG.SUB_PER_ROW * CFG.POD_W + CFG.LOUNGE_W + CFG.MARGIN_R),
    h: Math.max(CFG.MIN_H, CFG.WALL_H + CFG.TOP_GAP + (1 + rows) * podH + CFG.MARGIN_B),
  };
}

/**
 * Подредба: общ килим, решетка от SUB_PER_ROW колони. Горе – бюрата на оркестраторите (екип 1 в средната колона,
 * екип 2 – до него вдясно), под тях редовете на под-агентите: първо на екип 1, после на екип 2.
 * devW/devH – размер на прозореца във ФИЗИЧЕСКИ пиксели; spec = { teams: 1|2, rows: [редове на екип] }.
 * Връща логическия размер на стаята, мащаба (цяло число) и позициите на всичко.
 */
export function computeLayout(devW, devH, spec) {
  let best = null;
  // втори вариант с по-гъсти редове – за малки прозорци (печели само ако дава по-голям мащаб)
  for (const podH of [CFG.POD_H, CFG.POD_H_COMPACT]) {
    const need = teamNeed(spec, podH);
    const scale = Math.max(1, Math.min(CFG.MAX_SCALE, Math.floor(Math.min(devW / need.w, devH / need.h))));
    const score = scale * 1000 - (podH < CFG.POD_H ? 500 : 0);
    if (!best || score > best.score) best = { scale, score, needW: need.w, needH: need.h, podH };
  }
  const { scale, podH } = best;
  const W = Math.max(best.needW, Math.floor(devW / scale));
  const H = Math.max(best.needH, Math.floor(devH / scale));
  const per = CFG.SUB_PER_ROW, tr = teamRows(spec), rows = 1 + tr.reduce((s, r) => s + r, 0);

  // зоната с бюрата
  const ax0 = CFG.MARGIN_L, ax1 = W - CFG.LOUNGE_W - CFG.MARGIN_R;
  const ay0 = CFG.WALL_H + CFG.TOP_GAP, ay1 = H - CFG.MARGIN_B;
  const cols = per;
  const gw = Math.max(CFG.POD_W, Math.min(CFG.POD_W * CFG.SPREAD_X, (ax1 - ax0) / cols));
  const gh = Math.max(podH, Math.min(CFG.POD_H * CFG.SPREAD_Y, (ay1 - ay0) / rows));
  const gridW = gw * (per - 1) + CFG.POD_W, gridH = gh * (rows - 1) + podH;
  const ox = Math.round(ax0 + (ax1 - ax0 - gridW) / 2);
  // вертикално: малко по-близо до стената, отколкото в средата
  const oy = Math.round(ay0 + Math.max(0, (ay1 - ay0 - gridH) * 0.38));

  const pods = [];
  const teams = [];
  const mk = (team, role, slot, x, y, r) => {
    const i = pods.length;
    pods.push({ i, team, role, slot, r, x: Math.round(x), y: Math.round(y), cx: Math.round(x) + POD.seat.x, aisleY: Math.round(y) + POD.aisle.y, seatY: Math.round(y) + POD.seat.y });
  };
  // колоните на оркестраторите: екип 1 – в средата (както при един екип, не се мести), екип 2 – вдясно от него
  const LEAD_COL = [Math.floor(per / 2), Math.min(per - 1, Math.floor(per / 2) + 1)];
  let r0 = 1;
  for (let t = 0; t < spec.teams; t++) {
    teams.push({ x: Math.round(ox), y: oy, w: Math.round(gridW), h: Math.round(gridH), gw, row: r0, rows: tr[t] });
    mk(t, 'lead', 0, ox + gw * LEAD_COL[t], oy, 0);
    for (let k = 0; k < tr[t] * per; k++) mk(t, 'sub', k, ox + (k % per) * gw, oy + (r0 + Math.floor(k / per)) * gh, r0 + Math.floor(k / per));
    r0 += tr[t];
  }
  const rowYs = [...new Set(pods.map((p) => p.aisleY))];

  // зона за почивка вдясно
  const lx = W - CFG.MARGIN_R - CFG.LOUNGE_W, lw = CFG.LOUNGE_W, ly = CFG.WALL_H, lh = H - CFG.WALL_H;
  const base = CFG.WALL_H + 8;
  const sofaW = 58, sofaBase = Math.round(Math.min(H - 34, ly + Math.max(70, lh * 0.56)));
  const sofaX = Math.round(lx + (lw - sofaW) / 2 + 4);
  const lounge = {
    x: lx, y: ly, w: lw, h: lh,
    bookshelf: { x: lx + 4, base, w: 30, h: 50 },
    counter: { x: lx + 40, base, w: 30, h: 20 },
    cooler: { x: lx + 78, base, w: 14, h: 34 },
    tallPlant: { x: lx + lw - 22, base: base + 2 },
    sofa: { x: sofaX, base: sofaBase, w: sofaW, h: 26 },
    table: { x: sofaX + 15, base: sofaBase + 15, w: 28, h: 9 },
    floorLamp: { x: sofaX - 12, base: sofaBase - 2 },
    cornerPlant: { x: lx + lw - 20, base: H - 6 },
    rug: { x: sofaX - 10, y: sofaBase - 10, w: sofaW + 20, h: 30 },
    darts: { x: ax1 - 22, y: 16, w: 15, h: 15 },   // дъската за дартс – в десния край на стената с прозорците
    spots: {
      coffee: { x: lx + 55, y: base + 11, face: 'back' },
      cooler: { x: lx + 85, y: base + 11, face: 'back' },
      darts: { x: ax1 - 15, y: CFG.WALL_H + 13, face: 'back' },
      sofa: [{ x: sofaX + 16, y: sofaBase - 5 }, { x: sofaX + 42, y: sofaBase - 5 }],
      // места за чакащи сесии (опашка) – прави около масичката и до библиотеката
      extra: [
        { x: lx + 22, y: base + 13 }, { x: sofaX - 4, y: Math.min(H - 6, sofaBase + 22) },
        { x: sofaX + sofaW + 2, y: Math.min(H - 6, sofaBase + 22) }, { x: sofaX + 29, y: Math.min(H - 4, sofaBase + 30) },
      ],
    },
    laneY: Math.round(Math.min(sofaBase - 22, base + 26)),   // пътека през зоната за почивка
  };

  const door = { x: 10, y: CFG.WALL_H - 42, w: 24, h: 42, cx: 22, floorY: CFG.WALL_H + 6 };

  // килим под бюрата
  const rugs = [{ x: Math.round(ox) - 6, y: oy + 6, w: Math.round(gridW) + 12, h: Math.round(gridH) - 4 }]; // един общ килим

  return {
    scale, W, H, cols, rows, spec, pods, teams, rugs, rowYs, lounge, door, podH,
    need: teamNeed(spec), cap: pods.length,
    deskArea: { x0: ax0, x1: ax1, y0: ay0, y1: ay1 },
    leftLaneX: door.cx,
  };
}
