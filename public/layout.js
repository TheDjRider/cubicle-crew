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


/** Колко място иска стаята (логически px). Подредбата е постоянна: горе бюрата на двата оркестратора
 *  с принтера между тях, отдолу един ред с SUB_PER_ROW общи бюра за под-агентите. Нищо не се появява. */
export function teamNeed(podH = CFG.POD_H) {
  return {
    w: Math.max(CFG.MIN_W, CFG.MARGIN_L + CFG.SUB_PER_ROW * CFG.POD_W + CFG.LOUNGE_W + CFG.MARGIN_R),
    // ROW_STEP (прозрачен фон): долният ред е по-близо от височината на едно място – бюрата се застъпват
    h: Math.max(CFG.MIN_H, CFG.WALL_H + CFG.TOP_GAP + (CFG.ROW_STEP ?? podH) + podH + CFG.MARGIN_B),
  };
}

/**
 * Подредба: общ килим, решетка от SUB_PER_ROW колони. Горе – бюрата на оркестраторите (екип 1 в лявата колона,
 * екип 2 – в дясната, принтерът и растението – в средата), отдолу общите бюра на под-агентите (всеки сяда на свободно).
 * devW/devH – размер на прозореца във ФИЗИЧЕСКИ пиксели.
 * Връща логическия размер на стаята, мащаба (цяло число) и позициите на всичко.
 */
export function computeLayout(devW, devH) {
  let best = null;
  // втори вариант с по-гъсти редове – за малки прозорци (печели само ако дава по-голям мащаб)
  for (const podH of [CFG.POD_H, CFG.POD_H_COMPACT]) {
    const need = teamNeed(podH);
    const scale = Math.max(1, Math.min(CFG.MAX_SCALE, Math.floor(Math.min(devW / need.w, devH / need.h))));
    const score = scale * 1000 - (podH < CFG.POD_H ? 500 : 0);
    if (!best || score > best.score) best = { scale, score, needW: need.w, needH: need.h, podH };
  }
  const { scale, podH } = best;
  // FIXED_ROOM (прозрачен фон): стаята не се разтяга по прозореца – около нея е работният плот (index.html я слага долу вдясно)
  const W = CFG.FIXED_ROOM ? best.needW : Math.max(best.needW, Math.floor(devW / scale));
  const H = CFG.FIXED_ROOM ? best.needH : Math.max(best.needH, Math.floor(devH / scale));
  const per = CFG.SUB_PER_ROW, rows = 2;

  // зоната с бюрата
  const ax0 = CFG.MARGIN_L, ax1 = W - CFG.LOUNGE_W - CFG.MARGIN_R;
  const ay0 = CFG.WALL_H + CFG.TOP_GAP, ay1 = H - CFG.MARGIN_B;
  const cols = per;
  const gw = Math.max(CFG.POD_W, Math.min(CFG.POD_W * CFG.SPREAD_X, (ax1 - ax0) / cols));
  const gh = CFG.ROW_STEP ?? Math.max(podH, Math.min(CFG.POD_H * CFG.SPREAD_Y, (ay1 - ay0) / rows));
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
  // оркестраторите – в крайните колони, под-агентските бюра (team: null) – общи за всички екипи
  const LEAD_COL = [0, per - 1];
  for (let t = 0; t < CFG.MAX_TEAMS; t++) {
    teams.push({ x: Math.round(ox), y: oy, w: Math.round(gridW), h: Math.round(gridH), gw });
    mk(t, 'lead', 0, ox + gw * LEAD_COL[t], oy, 0);
  }
  for (let k = 0; k < per; k++) mk(null, 'sub', k, ox + k * gw, oy + gh, 1);
  const rowYs = [...new Set(pods.map((p) => p.aisleY))];

  // зона за почивка вдясно
  const lx = W - CFG.MARGIN_R - CFG.LOUNGE_W, lw = CFG.LOUNGE_W, ly = CFG.WALL_H, lh = H - CFG.WALL_H;
  const base = CFG.WALL_H + 8;
  // LOUNGE_UP (ниската стая с прозрачен фон): диванът с килима е по-нагоре, пътеката минава по-близо до кафемашината –
  // отдолу остава място за разходка на любимците
  const sofaW = 58, sofaBase = CFG.LOUNGE_UP ? base + 50 : Math.round(Math.min(H - 34, ly + Math.max(70, lh * 0.56)));
  const sofaX = Math.round(lx + (lw - sofaW) / 2 + 4);
  // масажният стол (купува се) – вдясно до дивана (центърът); долу остава свободно за любимците
  const massage = { x: sofaX + sofaW + 17, base: sofaBase + 6 };
  // аквариумът също е вдясно от дивана – ако има и масажен стол, отива под него, в същата тясна колона
  const aquarium = { x: sofaX + sofaW + 15, base: sofaBase };
  const aquaLow = { x: sofaX + sofaW + 17, base: Math.min(H - 5, sofaBase + 44) };
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
    arcade: { x: lx + lw - 14, base },                       // под неоновия надпис, вдясно от диспенсъра (центърът)
    aquarium, aquaLow,                                       // вдясно от дивана / под масажния стол (центърът)
    massage,                                                 // центърът на стола
    // кътът на любимците под килима: фонтан вляво, купичките до него, играчките – разхвърляни (base = долният ръб)
    pets: {
      fountain: { x: lx + 13, base: sofaBase + 38 },
      bowls: [{ x: lx + 29, base: sofaBase + 38 }, { x: lx + 31, base: sofaBase + 45 }, { x: lx + 41, base: sofaBase + 41 }],
      toys: [
        { kind: 'ball', x: lx + 58, base: sofaBase + 30 }, { kind: 'yarn', x: lx + 74, base: sofaBase + 36 },
        { kind: 'mouse', x: lx + 55, base: sofaBase + 46 }, { kind: 'bone', x: lx + 79, base: sofaBase + 49 },
      ],
    },
    rug: { x: sofaX - 10, y: sofaBase - 10, w: sofaW + 20, h: 30 },
    darts: { x: ax1 - 22, y: 16, w: 15, h: 15 },   // дъската за дартс – в десния край на стената с прозорците
    spots: {
      coffee: { x: lx + 55, y: base + 11, face: 'back' },
      cooler: { x: lx + 85, y: base + 11, face: 'back' },
      darts: { x: ax1 - 15, y: CFG.WALL_H + 13, face: 'back' },
      arcade: { x: lx + lw - 14, y: base + 11, face: 'back' },
      aquarium: { x: sofaX + sofaW + 7, y: sofaBase + 4, face: 'back' },   // в левия край – рибките се виждат
      aquaLow: { x: aquaLow.x - 10, y: aquaLow.base + 3, face: 'back' },
      massage: { x: massage.x, y: massage.base - 3 },
      sofa: [{ x: sofaX + 16, y: sofaBase - 5 }, { x: sofaX + 42, y: sofaBase - 5 }],
      // места за чакащи сесии (опашка) – прави около масичката и до библиотеката
      extra: [
        { x: lx + 22, y: base + 13 }, { x: sofaX - 4, y: Math.min(H - 6, sofaBase + 22) },
        { x: sofaX + sofaW + 2, y: Math.min(H - 6, sofaBase + 22) }, { x: sofaX + 40, y: Math.min(H - 4, sofaBase + 30) }, // вдясно от масажния стол
      ],
    },
    laneY: Math.round(CFG.LOUNGE_UP ? base + 16 : Math.min(sofaBase - 22, base + 26)),   // пътека през зоната за почивка
  };

  const door = { x: 10, y: CFG.WALL_H - 42, w: 24, h: 42, cx: 22, floorY: CFG.WALL_H + 6 };

  // килим под бюрата
  const rugs = [{ x: Math.round(ox) - 6, y: oy + 6, w: Math.round(gridW) + 12, h: Math.round(gridH) - 4 }]; // един общ килим

  return {
    scale, W, H, cols, rows, pods, teams, rugs, rowYs, lounge, door, podH,
    need: teamNeed(), cap: pods.length,
    deskArea: { x0: ax0, x1: ax1, y0: ay0, y1: ay1 },
    leftLaneX: Math.round(ox) - 4, // лявата вертикална пътека – до първата колона бюра
  };
}
