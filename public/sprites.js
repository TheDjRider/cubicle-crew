// Генератор на спрайтове за героите (24x32), само с код.
// Всеки кадър се сглобява от компактни пикселни карти (глава, коса, аксесоари)
// + сегменти за ръце/крака според позата, оцветява се с палитрата на агента
// и получава автоматичен "selective outline". Резултатът се кешира.
//
// Override: ако има sprites/characters.png (+ по желание characters.json), кадрите се
// взимат от него – вж. README, раздел "Формат на спрайт-листа".
import { SKINS, HAIRS, PANTS, SHOES, SKIRTS, TIGHTS, IRIS, ACCENTS, MUGS, OUTLINE, INK, ramp, mix, shade, hex2rgb } from './palette.js';
import { hashStr, rng, makeCanvas } from './util.js';

export const FW = 24, FH = 32;

// ---------------------------------------------------------------------
// Пикселни карти. '.' = прозрачно. Ключове:
//  h/s/S кожа (светло/средно/сянка)   y/r/R/Q коса (+ най-тъмна)   E ирис   Z набола брада
//  k/c/C риза (= цвета на състоянието)   K бяла яка/връзки   j/J акцент (вратовръзка, панделка)
//  q/p/P панталон или пола   G/F чорапогащник   O колан  Y катарама   b/B/V обувки (+ отблясък)
//  e очи  m уста  u руменина  A обеци/верижка  g рамки  l стъкла
//  H лента на слушалки  n/N/v шапка  w/W хартия  i мастило  M/x чаша  L бадж  t химикал
// ---------------------------------------------------------------------
const HEAD = [
  '..hsssssss..',
  '.hssssssssS.',
  'hhssssssssSS',
  'hsssssssssSS',
  'hsssssssssSS',
  'hsssssssssSS',
  'hsssssssssSS',
  'hsssssssssSS',
  'hsssssssssSS',
  '.ssssssssSS.',
  '..SSSSSSSS..',
];
const HEAD_X = 6, HEAD_Y = 3;

// Прически: map = 14 колони от x=5, ред 0 = y0 (главата е x6..17, y3..13; очите на y8).
//  behind – редове дълга коса зад тялото (от y9 надолу); strands – кичури отпред по раменете до този y;
//  tail – 'pony' (опашка) | 'braid' (плитка през рамо); bun – кок на темето (за изгледа отзад).
const H = (map, o = {}) => ({ map, behind: 0, strands: 0, tail: null, bun: false, ...o });
export const HAIR_STYLES = {
  short: H([
    '..............',
    '....rryyrr....',
    '..rryyyyyyrr..',
    '.rryyyrrrrrrR.',
    '.ryyrrrrrrrRR.',
    '.rrrrRrrrRrRR.',
    '.rRrr.r...rRR.',
    '.rR........RQ.',
    '.Q..........Q.',
  ]),
  spiky: H([
    '...r..y..r....',
    '..ry.ryy.ry.r.',
    '..ryyryyyrryr.',
    '.rryyyyrrrrrR.',
    '.ryrrrrrrrrRR.',
    '.rrRrrRrrrRRR.',
    '.rR.r..r..rRR.',
    '.R..........Q.',
  ]),
  side: H([
    '..............',
    '...rrryyrr....',
    '..ryyyyyyrrr..',
    '.ryyyyyrrrrrR.',
    '.rrrrrrrrrrRR.',
    '.rrrrrrrrrRRR.',
    '.rrrrrrR..rRR.',
    '.rRrr......RQ.',
    '.Q..........Q.',
  ]),
  quiff: H([
    '.....ryyyr....',
    '...rryyyyyrr..',
    '..rryyyrrrrrR.',
    '.rrrrrrrrrrrR.',
    '.rRrrrrrrrrRR.',
    '.rR.rRrrrR.RR.',
    '.R..........R.',
    '.Q..........Q.',
  ]),
  buzz: H([
    '..............',
    '..............',
    '...RRRRRRRR...',
    '..RrrrrrrrrR..',
    '.RrrRrrrRrrrR.',
    '.R..........R.',
  ]),
  curly: H([
    '...ryrrryr....',
    '..ryyrryyrrr..',
    '.rryrrryrrrrR.',
    'rryrrrryrrrrRR',
    'rrrrRrrrrRrrRR',
    'rrRrrRrrRrrRRR',
    'rrR.r.....rRRR',
    'rR..........RR',
    'rR..........RR',
    '.Q..........Q.',
  ]),
  long: H([
    '..............',
    '....rrrrrr....',
    '..rryyyyyyrr..',
    '.ryyyyrryyyrR.',
    'rryyrrRrrrrrRR',
    'ryrrrR.RrrrrRR',
    'rrrR......rRRR',
    'rrR........RRR',
    'rr..........RR',
    'rr..........RR',
    'rR..........RQ',
    'rR..........RQ',
    'RQ..........QQ',
  ], { behind: 9, strands: 19 }),
  wavy: H([
    '..............',
    '....rryyrr....',
    '..rryyyyyyrr..',
    '.ryyyyrrrrrrR.',
    'rryyrrrrrrrrRR',
    'ryrrrrrrrrrRRR',
    'rrrRr.....rRRR',
    'ryR........RRR',
    'rr..........yR',
    'Rr..........rR',
    'ry..........RR',
    'rr..........yR',
    'RQ..........QQ',
  ], { behind: 8, strands: 18, wave: true }),
  bob: H([
    '..............',
    '....rryyrr....',
    '..rryyyyyyrr..',
    '.ryyyyrrrrrrR.',
    'rryrrrrrrrrrRR',
    'ryrrrrrrrrrrRR',
    'rrrrrrrRRrrRRR',
    'rrR.r.....rRRR',
    'rr..........RR',
    'rr..........RR',
    'rR..........RR',
    'rR..........RQ',
    'RQr........rQQ',
    '.QQ........QQ.',
  ]),
  pony: H([
    '..............',
    '....rryyrr....',
    '..rryyyyyyrr..',
    '.ryyyyyrrrrrR.',
    '.ryyrrrrrrrRR.',
    '.rrrrrrrrrrRR.',
    '.rRr.....rrRR.',
    '.rR.......RR..',
    '.R..........R.',
  ], { tail: 'pony' }),
  braid: H([
    '..............',
    '....rryyrr....',
    '..rryyyyyyrr..',
    '.ryyyrryyyyrR.',
    '.rrrrRRrrrrRR.',
    '.rrrR..RrrrRR.',
    '.rRr......rRR.',
    '.rR........RR.',
    '.R..........R.',
  ], { tail: 'braid' }),
  bun: H([
    '.....ryyrR....',
    '....ryyyrrR...',
    '....QjjjjQ....',
    '.rryyyyyrrrrR.',
    '.ryyrrrrrrrRR.',
    '.rrrrrrrrrrRR.',
    '.rRr......rRR.',
    '.rR........R..',
    '.r..........R.',
  ], { bun: true }),
  pixie: H([
    '..............',
    '....rryyrr....',
    '..rryyyyyyrr..',
    '.ryyyyyyrrrrR.',
    '.ryyrrrrrrrRR.',
    '.rrrrrrrrrRRR.',
    '.rrrrrRR..rRR.',
    '.rRrR......RR.',
    '.rR.........R.',
    '.Q..........Q.',
  ]),
};
export const HAIR_MALE = ['short', 'spiky', 'side', 'quiff', 'buzz', 'curly'];
export const HAIR_FEMALE = ['long', 'wavy', 'bob', 'pony', 'braid', 'bun', 'pixie', 'curly'];
export const HAIR_NAMES = Object.keys(HAIR_STYLES);
// прическите, от които избира аватарът (по 4 за тяло; индексът е save data)
export const AVATAR_HAIR = { m: ['short', 'side', 'quiff', 'spiky'], f: ['long', 'pony', 'bob', 'bun'] };
// дрехите на аватара (индексите също са save data; 0 = досегашната фиксирана дреха). Мъжът е само с панталон.
export const AVATAR_TOPS = { m: ['collar', 'tee', 'tie', 'hoodie', 'vneck', 'stripe'], f: ['blouse', 'scoop', 'vneck', 'tee', 'hoodie', 'stripe'] };
export const AVATAR_BOTTOMS = { m: ['pants'], f: ['skirt', 'pants', 'dress'] };
export const DRESS_TOPS = new Set(['blouse', 'scoop', 'vneck', 'tee']); // с рокля не вървят суитшърт и райе

const BEANIE = [
  '......vv......',
  '....nnnnnn....',
  '..nnnnnnnnnn..',
  '.nnnnnnnnnnnN.',
  '.nnnnnnnnnnnN.',
  '.vvvvvvvvvvvv.',
  '.vNvvNvvNvvNv.',
];
const HEADPHONES = [
  '..............',
  '...HHHHHHHH...',
  '..H........H..',
  '.H..........H.',
  '.H..........H.',
  '.H..........H.',
  '.H..........H.',
  'jj..........jj',
  'jj..........jj',
  'jj..........jj',
  '.j..........j.',
];

// ---------------------------------------------------------------------
// Пози. arms: [ляв, десен] (лявата се огледално изчислява). legs: тип.
// face: front | side | back. Всички seated пози имат legs:'sit'.
// ---------------------------------------------------------------------
export const POSES = {
  sit: { arms: ['rest', 'rest'], legs: 'sit' },
  typeA: { arms: ['typeUp', 'typeDown'], legs: 'sit' },
  typeB: { arms: ['typeDown', 'typeUp'], legs: 'sit' },
  leanBack: { arms: ['behind', 'behind'], legs: 'sit', dy: -1, mouth: 'smile' },
  scratchA: { arms: ['rest', 'scratchA'], legs: 'sit', mouth: 'flat' },
  scratchB: { arms: ['rest', 'scratchB'], legs: 'sit', mouth: 'flat' },
  chin: { arms: ['rest', 'chin'], legs: 'sit', mouth: 'flat', look: 'up' },
  readA: { arms: ['hold', 'hold'], legs: 'sit', prop: 'paper', look: 'down' },
  readB: { arms: ['hold', 'hold'], legs: 'sit', prop: 'paperFlip', look: 'down' },
  writeA: { arms: ['rest', 'writeA'], legs: 'sit', prop: 'pen', look: 'down' },
  writeB: { arms: ['rest', 'writeB'], legs: 'sit', prop: 'pen', look: 'down' },
  throw: { arms: ['rest', 'up'], legs: 'sit', mouth: 'o', prop: 'plane' },
  sip: { arms: ['rest', 'mugUp'], legs: 'sit', prop: 'mugUp', eyes: 'closed' },
  stretch: { arms: ['up', 'up'], legs: 'sit', mouth: 'o', eyes: 'closed', dy: -1 },
  doze: { arms: ['rest', 'rest'], legs: 'sit', eyes: 'closed', headDy: 1, mouth: 'flat' },
  waveA: { arms: ['rest', 'waveA'], legs: 'sit', mouth: 'o' },
  waveB: { arms: ['rest', 'waveB'], legs: 'sit', mouth: 'o' },
  waveBothA: { arms: ['waveA', 'waveB'], legs: 'sit', mouth: 'o', dy: -1 },
  waveBothB: { arms: ['waveB', 'waveA'], legs: 'sit', mouth: 'o' },
  stand: { arms: ['down', 'down'], legs: 'stand' },
  standSip: { arms: ['down', 'mugUp'], legs: 'stand', prop: 'mugUp', eyes: 'closed' },
  standMug: { arms: ['down', 'mugHold'], legs: 'stand', prop: 'mugHold' },
  standWaveA: { arms: ['down', 'waveA'], legs: 'stand', mouth: 'o' },
  standWaveB: { arms: ['down', 'waveB'], legs: 'stand', mouth: 'o' },
  standThink: { arms: ['down', 'chin'], legs: 'stand', mouth: 'flat', look: 'up' },
  standBack: { arms: ['down', 'down'], legs: 'stand', face: 'back' },
  standBackUse: { arms: ['down', 'reach'], legs: 'stand', face: 'back' },
};
for (let i = 0; i < 4; i++) {
  const lift = i === 1 ? 'L' : i === 3 ? 'R' : null;
  POSES['walkF' + i] = { arms: [i === 1 ? 'swingB' : i === 3 ? 'swingF' : 'down', i === 1 ? 'swingF' : i === 3 ? 'swingB' : 'down'], legs: 'walkF', lift, dy: lift ? -1 : 0 };
  POSES['walkB' + i] = { ...POSES['walkF' + i], face: 'back' };
  POSES['walkS' + i] = { arms: ['none', ['sideF', 'sideM', 'sideB', 'sideM'][i]], legs: 'walkS' + i, face: 'side', dy: i % 2 ? -1 : 0 };
  POSES['carryS' + i] = { arms: ['none', 'sideCarry'], legs: 'walkS' + i, face: 'side', dy: i % 2 ? -1 : 0, prop: 'carry' };
}
// на дивана: както sit/sip/doze, но с видими подбедрици и обувки (на бюрото краката са под плота)
for (const p of ['sit', 'sip', 'doze']) POSES['couch' + p[0].toUpperCase() + p.slice(1)] = { ...POSES[p], legs: 'couch' };
// почивка: игра на конзола (два кадъра на екранчето) и дартс (с гръб, ръката назад -> напред)
POSES.couchGameA = { arms: ['hold', 'hold'], legs: 'couch', prop: 'gameA', look: 'down' };
POSES.couchGameB = { arms: ['hold', 'hold'], legs: 'couch', prop: 'gameB', look: 'down', mouth: 'smile' };
POSES.dartAim = { arms: ['down', 'reach'], legs: 'stand', face: 'back', prop: 'dart' };
POSES.dartThrow = { arms: ['down', 'up'], legs: 'stand', face: 'back' };
export const POSE_ORDER = Object.keys(POSES);

// ---------------------------------------------------------------------
// Сегменти на ръцете – дадени за ДЯСНАТА ръка (от гледна точка на зрителя);
// лявата е огледален образ. S = ръкав, H = длан. layer 1 = върху бюрото.
// ---------------------------------------------------------------------
const S = (x, y, w, h, layer = 0) => ({ k: 'S', x, y, w, h, layer });
const Hd = (x, y, w, h, layer = 0) => ({ k: 'H', x, y, w, h, layer });
const ARMS = {
  none: [],
  down: [S(18, 15, 3, 6), Hd(18, 21, 3, 2)],
  rest: [S(18, 15, 3, 4), S(16, 18, 4, 2, 1), Hd(14, 19, 3, 2, 1)],
  typeUp: [S(18, 15, 3, 4), S(16, 18, 4, 2, 1), Hd(14, 18, 3, 2, 1)],
  typeDown: [S(18, 15, 3, 4), S(16, 18, 4, 2, 1), Hd(15, 20, 3, 2, 1)],
  up: [S(18, 8, 3, 7), Hd(18, 5, 3, 3)],
  waveA: [S(19, 9, 3, 6), Hd(20, 6, 3, 3)],
  waveB: [S(18, 9, 3, 6), Hd(17, 6, 3, 3)],
  scratchA: [S(18, 12, 3, 4), S(17, 9, 3, 3), Hd(15, 5, 3, 3)],
  scratchB: [S(18, 12, 3, 4), S(17, 9, 3, 3), Hd(16, 4, 3, 3)],
  chin: [S(18, 15, 3, 3), S(15, 17, 4, 2), Hd(13, 13, 3, 3)],
  hold: [S(18, 15, 3, 3), S(17, 18, 2, 2, 1), Hd(15, 18, 3, 3, 1)],
  writeA: [S(18, 15, 3, 4), S(16, 18, 4, 2, 1), Hd(14, 19, 3, 2, 1)],
  writeB: [S(18, 15, 3, 4), S(16, 18, 4, 2, 1), Hd(15, 19, 3, 2, 1)],
  mugUp: [S(18, 15, 3, 3), S(16, 14, 3, 3), Hd(14, 12, 3, 2)],
  mugHold: [S(18, 15, 3, 4), S(16, 18, 3, 2), Hd(14, 18, 3, 2)],
  behind: [{ ...S(18, 8, 3, 7), back: true }, { ...Hd(16, 5, 3, 3), back: true }],
  swingF: [S(18, 15, 3, 5), Hd(18, 20, 3, 2)],
  swingB: [S(18, 16, 3, 5), Hd(19, 21, 3, 2)],
  reach: [S(18, 10, 3, 6), Hd(17, 8, 3, 3)],
  // страничен изглед (гледа надясно): една видима ръка върху тялото
  sideF: [S(11, 15, 3, 4), S(13, 19, 3, 2), Hd(15, 20, 2, 2)],
  sideM: [S(10, 15, 3, 6), Hd(10, 21, 3, 2)],
  sideB: [S(10, 15, 3, 4), S(8, 19, 3, 2), Hd(6, 20, 2, 2)],
  sideCarry: [S(11, 15, 3, 3), S(13, 17, 4, 2), Hd(16, 16, 2, 3)],
};

// ---------------------------------------------------------------------
// Решетка с ключове и слоеве
// ---------------------------------------------------------------------
class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.k = new Array(w * h).fill(null); this.l = new Uint8Array(w * h); this.layer = 0; }
  set(x, y, key) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !key) return;
    const i = y * this.w + x; this.k[i] = key; this.l[i] = this.layer;
  }
  clear(x, y) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.k[y * this.w + x] = null; }
  rect(key, x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, key); }
  map(rows, ox, oy) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.') this.set(ox + i, oy + j, ch); }
    }
  }
}

const mirrorX = (x, w) => FW - x - w;

function drawArm(g, mode, side, dy, short) {
  const segs = ARMS[mode] || [];
  for (const s of segs) {
    let x = s.x, w = s.w;
    if (side === 'L') x = mirrorX(s.x, s.w);
    const y = s.y + dy;
    const prevLayer = g.layer;
    if (s.layer) g.layer = 1;
    if (s.k === 'S') {
      // ляв ръкав – светъл, десен – в сянка. Къс ръкав: под рамото (y 14..17) е кожа, с подгъв.
      for (let j = 0; j < s.h; j++) {
        const yy = y + j;
        if (short && (yy > 17 + dy || yy < 14 + dy)) {
          g.rect('s', x, yy, w, 1); g.set(side === 'L' ? x : x + w - 1, yy, 'S');
          continue;
        }
        g.rect(side === 'L' ? 'c' : 'C', x, yy, w, 1);
        g.set(x, yy, side === 'L' ? 'k' : 'c');
        if (short && yy === 17 + dy) g.rect('C', x, yy, w, 1);
      }
    } else {
      g.rect('s', x, y, w, s.h);
      g.rect('S', side === 'L' ? x : x + w - 1, y + s.h - 1, 1, 1);
      if (s.h >= 2 && s.w >= 3) g.set(side === 'L' ? x + w - 1 : x, y, 'h'); // палецът хваща светлина
    }
    g.layer = prevLayer;
  }
}
const isBackArm = (mode) => (ARMS[mode] || []).some((s) => s.back);

const shoe = (g, x, y, w, near = true) => {
  if (!near) { g.rect('B', x, y, w, 2); return; }
  g.rect('b', x, y, w, 2); g.rect('B', x, y + 1, w, 1); g.set(x + 1, y, 'V');
};

function drawLegs(g, pose, top, look) {
  const legs = pose.legs;
  const skirt = look.bottom !== 'pants';
  const L = ['G', 'F']; // крака под пола (чорапогащник или кожа – решава палитрата)
  if (legs === 'sit' || legs === 'couch') {
    g.rect('p', 6, top, 12, 3); g.rect('q', 6, top, 12, 1); g.rect('P', 15, top + 1, 3, 2);
    if (skirt) { g.set(5, top + 1, 'p'); g.set(5, top + 2, 'q'); g.set(18, top + 1, 'P'); g.set(18, top + 2, 'P'); g.rect('P', 10, top + 1, 1, 2); }
    else g.rect('P', 11, top + 1, 2, 2); // шев между бедрата
    if (legs === 'couch') {
      // подбедрици надолу пред седалката + обувки
      for (const [x, r] of [[7, false], [13, true]]) {
        if (skirt) {
          g.rect(L[0], x + (r ? 0 : 1), top + 3, 3, 3); g.rect(L[1], r ? x + 2 : x + 1, top + 3, 1, 3);
          shoe(g, x, top + 6, 4);
        } else {
          g.rect('p', x, top + 3, 4, 3); g.rect(r ? 'P' : 'q', r ? x + 3 : x, top + 3, 1, 3);
          shoe(g, x - (r ? 0 : 1), top + 6, 5);
        }
      }
    }
    return;
  }
  if (legs === 'stand' || legs === 'walkF') {
    const lift = pose.lift;
    if (skirt) {
      // разкроена пола с гънки, отдолу крака и обувки
      g.rect('p', 6, top, 12, 2); g.rect('p', 5, top + 2, 14, 2);
      g.rect('q', 6, top, 1, 2); g.rect('q', 5, top + 2, 1, 2); g.rect('q', 7, top, 3, 1);
      g.rect('P', 16, top, 2, 2); g.rect('P', 16, top + 2, 3, 2);
      g.rect('P', 10, top + 1, 1, 3); g.rect('P', 13, top + 2, 1, 2);
      const leg = (x, lifted, right) => {
        const len = lifted ? 1 : 2;
        g.rect(L[0], x, top + 4, 3, len); g.rect(L[1], right ? x + 2 : x, top + 4, 1, len);
        shoe(g, right ? x : x - 1, top + 4 + len, 4);
      };
      leg(8, lift === 'L', false); leg(13, lift === 'R', true);
      return;
    }
    const leg = (x, lifted, right) => {
      const len = lifted ? 5 : 6;
      g.rect('p', x, top, 4, len); g.rect(right ? 'P' : 'q', right ? x + 3 : x, top, 1, len);
      g.set(right ? x + 1 : x + 2, top + 3, right ? 'P' : 'p'); // коляно
      g.rect('P', x, top + len - 1, 4, 1); // подгъв
      shoe(g, x - (right ? 0 : 1), top + len, 5);
    };
    leg(7, lift === 'L', false); leg(13, lift === 'R', true);
    g.rect('P', 11, top, 2, 2);
    g.set(8, top, 'P'); g.set(15, top, 'q'); // джобове
    return;
  }
  // страничен ход (надясно). Кадри 0/2 – крачка, 1/3 – краката заедно
  const f = Number(legs.slice(-1));
  if (skirt) {
    g.rect('p', 8, top, 8, 1); g.rect('p', 7, top + 1, 9, 1); g.rect('p', 7, top + 2, 10, 2);
    g.rect('q', 8, top, 2, 1); g.rect('q', 7, top + 1, 1, 3);
    g.rect('P', 15, top + 1, 1, 1); g.rect('P', 15, top + 2, 2, 2); g.rect('P', 11, top + 1, 1, 3);
    const nearL = f === 2 ? L[1] : L[0], farL = f === 2 ? L[0] : L[1];
    if (f % 2 === 0) {
      g.rect(farL, 8, top + 4, 2, 2); shoe(g, 6, top + 6, 4, f === 2);
      g.rect(nearL, 13, top + 4, 2, 2); shoe(g, 13, top + 6, 5, f !== 2);
    } else {
      g.rect(L[1], 10, top + 4, 2, 2); shoe(g, 9, top + 6, 4, false);
      g.rect(L[0], 12, top + 4, 2, 2); shoe(g, 12, top + 6, 5);
    }
    return;
  }
  const far = f === 2 ? 'p' : 'P', near = f === 2 ? 'P' : 'p';
  if (f % 2 === 0) {
    g.rect(far, 8, top, 4, 3); g.rect(far, 6, top + 3, 4, 3); shoe(g, 4, top + 6, 5, f === 2);
    g.rect(near, 12, top, 4, 3); g.rect(near, 14, top + 3, 4, 3); shoe(g, 14, top + 6, 6, f !== 2);
  } else {
    g.rect(far, 9, top, 4, 6); shoe(g, 8, top + 6, 5, false);
    g.rect(near, 11, top, 4, 6); g.set(14, top + 3, 'P'); shoe(g, 11, top + 6, 6);
  }
}

function drawTorso(g, look, face, dy) {
  const y0 = 14 + dy, top = look.top, dress = look.bottom === 'dress';
  g.rect('c', 6, y0, 12, 9);
  g.rect('k', 6, y0 + 1, 2, 7); g.rect('k', 7, y0, 3, 1);
  g.rect('C', 15, y0 + 1, 3, 8); g.rect('C', 6, y0 + 8, 12, 1);
  g.clear(6, y0); g.clear(17, y0);
  // гънки на плата
  if (look.fem && face !== 'side') for (const yy of [y0 + 5, y0 + 6]) { g.clear(6, yy); g.clear(17, yy); g.set(7, yy, 'k'); g.set(16, yy, 'C'); } // талия
  // колан / пояс + запълване до панталона (за да няма дупка при подскачане)
  const low = top === 'hoodie' || dress ? 'C' : 'P';
  g.rect(low, 6, y0 + 9, 12, 24 - (y0 + 9));
  if (top === 'hoodie') { g.rect('c', 6, y0 + 8, 12, 24 - (y0 + 8) - 1); g.rect('C', 6, 23, 12, 1); g.rect('k', 6, y0 + 8, 2, 24 - (y0 + 8) - 1); g.rect('C', 15, y0 + 8, 3, 24 - (y0 + 8)); }
  else if (dress) { g.rect('j', 6, 23, 12, 1); g.rect('J', 15, 23, 3, 1); }
  else { g.rect('O', 6, 23, 12, 1); if (face === 'front') g.rect('Y', 11, 23, 2, 1); else if (face === 'side') g.set(14, 23, 'Y'); }

  if (face === 'back') {
    if (top === 'hoodie') { g.rect('C', 8, y0, 8, 3); g.rect('c', 9, y0, 6, 2); g.rect('k', 9, y0, 2, 1); }
    else if (top === 'collar' || top === 'tie' || top === 'blouse') g.rect('K', 9, y0, 6, 1);
    else g.rect('C', 9, y0, 6, 1);
    return;
  }
  if (face === 'side') {
    g.rect('s', 12, y0, 3, 1); g.set(13, y0 + 1, 'S');
    if (top === 'hoodie') { g.rect('C', 7, y0, 4, 2); g.rect('k', 7, y0, 2, 1); g.rect('K', 15, y0 + 1, 1, 3); }
    else if (top === 'collar' || top === 'tie' || top === 'blouse') { g.set(11, y0, 'K'); g.set(15, y0, 'K'); if (top === 'tie') g.rect('j', 15, y0 + 1, 1, 5); }
    else if (top === 'scoop') g.set(15, y0 + 1, 'A');
    return;
  }
  // отпред: деколте и детайли според дрехата
  switch (top) {
    case 'collar': case 'tie':
      g.rect('s', 11, y0, 2, 1);
      g.rect('K', 9, y0, 2, 1); g.set(10, y0 + 1, 'K'); g.rect('K', 13, y0, 2, 1); g.set(13, y0 + 1, 'K');
      if (top === 'tie') {
        g.rect('j', 11, y0 + 1, 2, 1); g.rect('j', 11, y0 + 2, 2, 5); g.rect('J', 12, y0 + 2, 1, 5); g.set(11, y0 + 7, 'J');
      } else {
        g.rect('C', 12, y0 + 2, 1, 6); g.set(12, y0 + 3, 'K'); g.set(12, y0 + 6, 'K');
        g.rect('C', 7, y0 + 3, 3, 1); g.set(8, y0 + 2, 't'); // джоб с химикал
      }
      break;
    case 'hoodie':
      g.rect('C', 8, y0, 8, 1); g.rect('s', 10, y0, 4, 1); g.rect('C', 9, y0 + 1, 6, 1); g.rect('S', 11, y0 + 1, 2, 1);
      g.rect('K', 10, y0 + 2, 1, 3); g.rect('K', 13, y0 + 2, 1, 2);
      g.rect('C', 8, y0 + 6, 8, 1); g.set(8, y0 + 7, 'C'); g.set(15, y0 + 7, 'C');
      break;
    case 'vneck':
      g.set(9, y0, 'C'); g.rect('s', 10, y0, 4, 1); g.set(14, y0, 'C');
      g.set(10, y0 + 1, 'C'); g.set(11, y0 + 1, 's'); g.set(12, y0 + 1, 'S'); g.set(13, y0 + 1, 'C');
      g.rect('C', 11, y0 + 2, 2, 1);
      break;
    case 'blouse':
      g.rect('K', 8, y0, 2, 1); g.rect('s', 10, y0, 4, 1); g.rect('K', 14, y0, 2, 1);
      g.rect('K', 9, y0 + 1, 2, 1); g.rect('S', 11, y0 + 1, 2, 1); g.rect('K', 13, y0 + 1, 2, 1);
      g.rect('j', 11, y0 + 2, 2, 1); g.set(10, y0 + 2, 'J'); g.set(13, y0 + 2, 'J'); // панделка
      g.set(12, y0 + 4, 'C'); g.set(12, y0 + 6, 'C');
      break;
    case 'scoop':
      g.rect('s', 9, y0, 6, 1); g.rect('s', 10, y0 + 1, 4, 1); g.set(13, y0 + 1, 'S');
      g.set(10, y0 + 1, 'A'); g.set(13, y0 + 1, 'A'); g.rect('A', 11, y0 + 2, 2, 1); // верижка с висулка
      g.set(9, y0 + 1, 'C'); g.set(14, y0 + 1, 'C');
      break;
    default: // tee, stripe
      g.rect('s', 10, y0, 4, 1); g.rect('S', 11, y0 + 1, 2, 1); g.set(9, y0, 'C'); g.set(14, y0, 'C');
      if (top === 'stripe') for (const yy of [y0 + 3, y0 + 6]) { g.rect('K', 7, yy, 8, 1); g.rect('W', 15, yy, 2, 1); }
  }
}

// брада/мустак отпред: 12 колони от x6, редове от hy+6
const BEARD = [
  'r..........R',
  'rr..rrrR..RR',
  'rrrr....rRRR',
  '.rrrrrrrRRR.',
  '..rrrrrRRR..',
];

function drawHead(g, look, dir, face, headDy, eyes, mouth) {
  const hy = HEAD_Y + headDy, fem = look.fem;
  g.map(HEAD, HEAD_X, hy);
  if (face !== 'side') {
    g.rect('s', 5, hy + 5, 1, 2); g.rect('S', 18, hy + 5, 1, 2);
    if (look.earrings) { g.set(5, hy + 7, 'A'); g.set(18, hy + 7, 'A'); }
  } else if (look.earrings) g.set(9, hy + 8, 'A');
  if (face === 'back') return;
  const ex = face === 'side' ? [12, 16] : [9, 14];
  const ey = hy + 5 + (dir === 'down' ? 1 : 0) - (dir === 'up' ? 1 : 0);
  // вежди (под косата – бретонът ги покрива)
  g.rect('R', ex[0] - 1, hy + 3 - (dir === 'up' ? 1 : 0), 2, 1); g.rect('R', ex[1], hy + 3 - (dir === 'up' ? 1 : 0), face === 'side' ? 1 : 2, 1);
  if (eyes === 'closed') {
    g.rect('e', ex[0] - 1, hy + 6, 2, 1); g.rect('e', ex[1], hy + 6, 2, 1);
    if (fem) { g.set(ex[0] - 1, hy + 7, 'e'); if (face !== 'side') g.set(ex[1] + 1, hy + 7, 'e'); }
  } else {
    for (const x of ex) { g.set(x, ey, 'e'); g.set(x, ey + 1, 'E'); }
    if (fem) { g.set(ex[0] - 1, ey, 'e'); if (face !== 'side') g.set(ex[1] + 1, ey, 'e'); } // мигли
  }
  if (face === 'front' && fem) { g.set(7, hy + 7, 'u'); g.set(16, hy + 7, 'u'); }
  if (face === 'side') g.set(18, hy + 6, 's'); // нос
  // брада / набола брада / мустак
  if (look.beard) {
    const k = look.beard === 'stubble' ? 'Z' : null;
    if (face === 'front') {
      const rows = look.beard === 'mustache' ? [BEARD[1].replace(/^rr|RR$/g, '..')] : BEARD;
      const oy = look.beard === 'mustache' ? hy + 7 : hy + 6;
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < 12; i++) { const ch = rows[j][i]; if (ch !== '.') g.set(6 + i, oy + j, k || ch); }
    } else {
      if (look.beard !== 'mustache') { g.rect(k || 'r', 9, hy + 6, 2, 3); g.rect(k || 'r', 10, hy + 9, 7, 1); g.rect(k || 'R', 11, hy + 10, 5, 1); g.rect(k || 'r', 16, hy + 8, 2, 1); }
      g.rect(k || 'R', 15, hy + 7, 3, 1);
    }
  }
  const mx = face === 'side' ? 15 : 11;
  if (mouth === 'o') { g.rect('m', mx, hy + 8, 2, 2); }
  else if (mouth === 'flat') g.rect('m', mx, hy + 8, 2, 1);
  else { g.rect('m', mx, hy + 8, 2, 1); if (!look.beard) { g.set(mx - 1, hy + 7, 'S'); g.set(mx + 2, hy + 7, 'S'); } }
}

/** Дълга коса зад тялото и опашка/плитка зад главата (рисува се преди тялото). */
function drawHairBehind(g, st, face, oy) {
  if (face === 'back') return;
  if (st.behind) { g.rect('R', 5, 9 + oy, 14, st.behind); g.rect('r', 5, 9 + oy, 2, st.behind - 1); }
  if (st.tail === 'pony' || (st.tail === 'braid' && face === 'side')) {
    if (face === 'side') { g.rect('j', 5, 6 + oy, 1, 2); g.rect('r', 3, 7 + oy, 2, 7); g.rect('R', 3, 9 + oy, 1, 5); g.set(4, 14 + oy, 'R'); g.set(4, 7 + oy, 'y'); }
    else { g.rect('r', 18, 6 + oy, 2, 7); g.rect('R', 19, 7 + oy, 1, 6); g.set(18, 13 + oy, 'R'); g.set(18, 6 + oy, 'y'); }
  }
}

function drawHair(g, look, face, headDy) {
  const st = HAIR_STYLES[look.hair] || HAIR_STYLES.short;
  const oy = headDy;
  if (face === 'back') {
    // тила е изцяло коса, с кичури
    g.rect('r', 6, 3 + oy, 12, 10); g.rect('R', 15, 4 + oy, 3, 9); g.rect('y', 7, 3 + oy, 4, 1); g.rect('y', 8, 4 + oy, 2, 1);
    g.rect('y', 8, 5 + oy, 1, 3); g.rect('R', 13, 7 + oy, 1, 4); g.rect('R', 10, 9 + oy, 1, 3);
    if (look.hair === 'buzz') { g.rect('R', 6, 3 + oy, 12, 10); g.rect('r', 7, 4 + oy, 9, 7); }
    if (st.bun) { g.rect('r', 9, 0 + oy, 6, 2); g.rect('y', 10, 0 + oy, 2, 1); g.rect('R', 14, 0 + oy, 1, 2); g.rect('j', 9, 2 + oy, 6, 1); }
    if (st.behind) {
      const n = st.behind - 3;
      g.rect('r', 6, 13 + oy, 12, n); g.rect('R', 15, 13 + oy, 3, n); g.rect('y', 7, 13 + oy, 1, n - 1);
      g.rect('R', 10, 13 + oy, 1, n - 1); g.rect('y', 13, 14 + oy, 1, n - 3);
      g.rect('R', 7, 13 + oy + n, 10, 1);
    }
    if (st.tail) {
      g.rect('j', 10, 9 + oy, 4, 1);
      if (st.tail === 'pony') { g.rect('r', 10, 10 + oy, 4, 6); g.rect('R', 13, 10 + oy, 1, 6); g.set(10, 10 + oy, 'y'); g.rect('r', 11, 16 + oy, 2, 2); g.set(12, 17 + oy, 'R'); }
      else for (let y = 10; y < 20; y++) { g.set(11, y + oy, y % 2 ? 'r' : 'R'); g.set(12, y + oy, y % 2 ? 'R' : 'r'); }
      if (st.tail === 'braid') { g.rect('j', 11, 20 + oy, 2, 1); g.rect('r', 11, 21 + oy, 2, 1); }
    }
  }
  g.map(st.map, 5, oy);
  if (face === 'back' && !st.behind) g.rect('R', 6, 12 + oy, 12, 1);
}

/** Кичури пред раменете / плитка през рамо (само отпред, след тялото). */
function drawHairFront(g, st, oy) {
  if (st.strands) {
    for (let y = 12 + oy; y < st.strands + oy; y++) {
      const w = st.wave && (y & 1);
      g.set(5, y, w ? 'y' : 'r'); g.set(6, y, 'r'); g.set(17, y, 'R'); g.set(18, y, w ? 'r' : 'R');
    }
    g.clear(6, st.strands + oy - 1); g.set(17, st.strands + oy - 1, 'Q');
  }
  if (st.tail === 'braid') {
    for (let y = 12; y < 21; y++) { g.set(16, y + oy, y % 2 ? 'r' : 'y'); g.set(17, y + oy, y % 2 ? 'R' : 'r'); }
    g.rect('j', 16, 21 + oy, 2, 1); g.set(16, 22 + oy, 'r'); g.set(17, 22 + oy, 'R');
  }
}

function drawAccessories(g, look, face, headDy) {
  const oy = headDy;
  if (look.acc.includes('glasses') && face !== 'back') {
    const y = 7 + oy;
    if (face === 'side') { g.rect('g', 11, y, 4, 1); g.rect('l', 12, y + 1, 2, 2); g.rect('g', 11, y + 1, 1, 2); g.rect('g', 14, y + 1, 1, 2); g.rect('g', 11, y + 3, 4, 1); g.rect('g', 6, y + 1, 5, 1); }
    else {
      for (const x0 of [8, 13]) { g.rect('g', x0, y, 4, 1); g.rect('g', x0, y + 3, 4, 1); g.rect('g', x0, y + 1, 1, 2); g.rect('g', x0 + 3, y + 1, 1, 2); g.rect('l', x0 + 1, y + 1, 2, 2); g.set(x0 + 1, y + 1, 'K'); }
      g.set(12, y + 1, 'g');
    }
  }
  if (look.acc.includes('beanie')) g.map(BEANIE, 5, oy);
  if (look.acc.includes('headphones')) g.map(HEADPHONES, 5, oy);
}

function drawProp(g, prop, dy, layerFront) {
  if (!prop) return;
  const prev = g.layer;
  if (prop === 'paper' || prop === 'paperFlip') {
    g.layer = 1;
    const y0 = 15 + dy;
    g.rect('w', 7, y0, 10, 8); g.rect('W', 16, y0, 1, 8); g.rect('W', 7, y0 + 7, 10, 1);
    for (const [ly, lw] of [[2, 7], [4, 5], [6, 6]]) g.rect('i', 8, y0 + ly - 1, lw, 1);
    if (prop === 'paperFlip') { g.rect('w', 8, y0 - 3, 8, 3); g.rect('W', 8, y0 - 1, 8, 1); g.rect('i', 9, y0 - 2, 5, 1); }
  } else if (prop === 'mugUp') {
    g.rect('M', 12, 11 + dy, 3, 4); g.rect('x', 14, 11 + dy, 1, 4); g.set(15, 12 + dy, 'x');
  } else if (prop === 'mugHold') {
    g.rect('M', 13, 16 + dy, 3, 4); g.rect('x', 15, 16 + dy, 1, 4);
  } else if (prop === 'pen') {
    g.layer = 1; g.rect('t', 15, 16 + dy, 1, 3);
  } else if (prop === 'plane') {
    g.rect('w', 17, 2 + dy, 5, 2); g.rect('W', 18, 4 + dy, 3, 1); g.set(22, 2 + dy, 'w');
  } else if (prop === 'gameA' || prop === 'gameB') {
    // конзолка в двете ръце: корпус, екранче, бутони
    g.layer = 1;
    const y0 = 17 + dy;
    g.rect('d', 7, y0, 10, 5); g.rect('D', 7, y0 + 4, 10, 1);
    g.rect('z', 10, y0 + 1, 4, 3);
    const b = prop === 'gameB';
    g.set(b ? 12 : 10, y0 + 2, 'a'); g.set(b ? 11 : 13, y0 + 1, 'o'); g.set(b ? 13 : 11, y0 + 3, 'a');
    g.set(8, y0 + 2, 'D'); g.set(15, y0 + 1, 'o'); g.set(16, y0 + 2, 'a');
  } else if (prop === 'dart') {
    g.rect('W', 18, 4 + dy, 1, 2); g.set(18, 3 + dy, 'f');
  } else if (prop === 'carry') {
    g.rect('w', 15, 14 + dy, 6, 7); g.rect('W', 20, 14 + dy, 1, 7); g.rect('i', 16, 16 + dy, 4, 1); g.rect('i', 16, 18 + dy, 3, 1);
  }
  g.layer = prev;
  void layerFront;
}

function drawBadge(g, dy, face) {
  if (face === 'back') return;
  const y = 14 + dy;
  if (face === 'side') { g.rect('L', 13, y + 1, 1, 3); g.rect('w', 13, y + 4, 2, 3); return; }
  g.set(9, y + 1, 'L'); g.set(10, y + 2, 'L'); g.set(14, y + 1, 'L'); g.set(13, y + 2, 'L');
  g.rect('L', 11, y + 3, 2, 1); g.rect('w', 11, y + 4, 2, 3); g.set(12, y + 5, 'L');
}

const PROPS_IN_HANDS = new Set(['paper', 'paperFlip', 'gameA', 'gameB']);

/** Сглобява кадъра в решетка от ключове. */
function compose(look, poseName, eyesOverride) {
  const pose = POSES[poseName] || POSES.sit;
  const face = pose.face || 'front';
  const g = new Grid(FW, FH);
  const dy = pose.dy || 0;
  const headDy = dy + (pose.headDy || 0);
  const eyes = eyesOverride || pose.eyes || 'open';
  const dir = pose.look || null;
  const [armL, armR] = pose.arms;
  const st = HAIR_STYLES[look.hair] || HAIR_STYLES.short;

  drawHairBehind(g, st, face, headDy);
  // ръце зад главата
  if (isBackArm(armL)) drawArm(g, armL, 'L', 0, look.short);
  if (isBackArm(armR)) drawArm(g, armR, 'R', 0, look.short);
  drawLegs(g, pose, 24, look);
  drawTorso(g, look, face, dy);
  if (look.badge) drawBadge(g, dy, face);
  drawHead(g, look, dir, face, headDy, eyes, pose.mouth);
  drawHair(g, look, face, headDy);
  if (face === 'front') drawHairFront(g, st, headDy);
  drawAccessories(g, look, face, headDy);
  const held = PROPS_IN_HANDS.has(pose.prop); // държи се с двете ръце – ръцете са отгоре
  drawProp(g, held ? pose.prop : null, dy);
  if (!isBackArm(armL)) drawArm(g, armL, 'L', 0, look.short);
  if (!isBackArm(armR)) drawArm(g, armR, 'R', 0, look.short);
  if (pose.prop && !held) drawProp(g, pose.prop, 0);
  return g;
}

// ---------------------------------------------------------------------
// Външен вид от id (детерминирано)
// ---------------------------------------------------------------------
const TOPS_M = ['tee', 'collar', 'tie', 'hoodie', 'vneck', 'stripe'];
const TOPS_F = ['blouse', 'scoop', 'vneck', 'tee', 'hoodie', 'stripe'];
const SHORT_OK = new Set(['tee', 'vneck', 'scoop', 'blouse', 'stripe']);

export function lookFor(id, isSub) {
  const r = rng(hashStr(String(id)));
  const fem = r() < 0.5;
  const accRoll = r();
  const acc = [];
  if (accRoll < 0.26) acc.push('glasses');
  else if (accRoll < 0.40) acc.push('headphones');
  else if (accRoll < 0.50) acc.push('beanie');
  else if (accRoll < 0.56) acc.push('glasses', 'headphones');
  else if (accRoll < 0.60) acc.push('glasses', 'beanie');
  const hairIdx = r.int(HAIRS.length);
  // ярките бои за коса по-рядко
  const hair = hairIdx >= 6 && r() < 0.6 ? HAIRS[r.int(6)] : HAIRS[hairIdx];
  const styles = r() < 0.08 ? (fem ? ['buzz', 'side'] : ['pony', 'long']) : (fem ? HAIR_FEMALE : HAIR_MALE);
  const bottom = fem ? r.pick(['pants', 'skirt', 'skirt', 'dress']) : 'pants';
  let top = r.pick(fem ? TOPS_F : TOPS_M);
  if (bottom === 'dress' && (top === 'hoodie' || top === 'stripe')) top = 'scoop';
  const fh = r();
  return {
    id, fem,
    skin: r.pick(SKINS),
    hairColor: hair,
    hair: r.pick(styles),
    top, bottom,
    short: SHORT_OK.has(top) && r() < 0.6,
    pants: bottom === 'pants' ? r.pick(PANTS) : r.pick(SKIRTS),
    tights: r.pick(TIGHTS),
    shoes: r.pick(SHOES),
    iris: r.pick(IRIS),
    beard: fem ? null : fh < 0.14 ? 'beard' : fh < 0.26 ? 'stubble' : fh < 0.34 ? 'mustache' : null,
    earrings: fem && r() < 0.65,
    accent: r.pick(ACCENTS),
    mug: r.pick(MUGS),
    acc,
    badge: !!isSub,
    variant: r.int(1000),
    seed: hashStr(String(id) + 'desk'),
  };
}

/** Аватарът на оркестраторите: тяло, прическа, кожа, цвят на косата и очила от потребителя; останалото е фиксирано. */
export function avatarLook(av, id) {
  const fem = av.body === 1, g = fem ? 'f' : 'm';
  const styles = AVATAR_HAIR[g];
  const bottom = AVATAR_BOTTOMS[g][av.bottom] || AVATAR_BOTTOMS[g][0];
  let top = AVATAR_TOPS[g][av.top] || AVATAR_TOPS[g][0];
  if (bottom === 'dress' && !DRESS_TOPS.has(top)) top = 'scoop';
  return {
    id, fem,
    skin: SKINS[av.skin] || SKINS[1],
    hairColor: HAIRS[av.hair] || HAIRS[1],
    hair: styles[av.style] || styles[0],
    top, bottom,
    short: false,
    pants: bottom === 'skirt' ? SKIRTS[0] : fem ? PANTS[3] : PANTS[0],
    tights: null,
    shoes: fem ? SHOES[3] : SHOES[0],
    iris: IRIS[0],
    beard: null,
    earrings: fem,
    accent: ACCENTS[1],
    mug: MUGS[2],
    acc: av.glasses ? ['glasses'] : [],
    badge: false,
    variant: 0,
    seed: hashStr(String(id) + 'desk'),
  };
}

function paletteFor(look, shirt) {
  const sh = ramp(shirt);
  const ac = ramp(look.accent);
  const bot = look.bottom === 'dress' ? [sh.hi, sh.mid, sh.lo] : look.pants;
  const legs = look.tights || [look.skin[1], look.skin[2]];
  return {
    h: look.skin[0], s: look.skin[1], S: look.skin[2],
    y: look.hairColor[0], r: look.hairColor[1], R: look.hairColor[2], Q: shade(look.hairColor[2], 0.72),
    Z: mix(look.skin[1], look.hairColor[2], 0.45),
    k: sh.hi, c: sh.mid, C: sh.lo, K: '#f4f0e6',
    q: bot[0], p: bot[1], P: bot[2],
    G: legs[0], F: legs[1],
    O: '#3a2a26', Y: '#e0c068', A: '#f2d266',
    b: look.shoes[0], B: look.shoes[1], V: mix(look.shoes[0], '#ffffff', 0.4),
    e: INK, E: look.iris || INK,
    m: look.fem ? mix('#d04a64', look.skin[1], 0.2) : '#7a3440', u: mix(look.skin[1], '#ff7a8a', 0.35),
    g: '#22202a', l: '#a8d0f0',
    H: '#2a2a36', j: look.accent, J: shade(look.accent, 0.7),
    n: ac.mid, N: ac.lo, v: ac.hi,
    w: '#f6f3ea', W: '#c9c2b0', i: '#5a6a9a', t: '#2a6ad0',
    M: look.mug, x: shade(look.mug, 0.72),
    L: '#b04ae0',
    d: '#4a4a5a', D: '#2a2a36', z: '#1e3a3a', a: '#6ae08a', o: '#f07ab0', f: '#e05a5a',
  };
}

/** Решетка -> два канваса (тяло и "върху бюрото") с автоматичен контур. */
function rasterize(g, pal) {
  const w = g.w, h = g.h;
  const col = new Array(w * h).fill(null);
  for (let i = 0; i < w * h; i++) if (g.k[i]) col[i] = hex2rgb(pal[g.k[i]] || '#ff00ff');
  const outC = hex2rgb(OUTLINE);
  const layers = [makeCanvas(w, h), makeCanvas(w, h)];
  const imgs = layers.map((c) => c.getContext('2d').createImageData(w, h));
  const put = (layer, i, rgb, a = 255) => { const d = imgs[layer].data; d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = a; };
  for (let i = 0; i < w * h; i++) if (col[i]) put(g.l[i], i, col[i]);
  // selective outline: цветен контур (по-тъмен вариант на съседа), отгоре по-светъл
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (col[i]) continue;
    let n = -1, fromTop = false;
    if (y + 1 < h && col[i + w]) { n = i + w; fromTop = true; }
    else if (x > 0 && col[i - 1]) n = i - 1;
    else if (x + 1 < w && col[i + 1]) n = i + 1;
    else if (y > 0 && col[i - w]) n = i - w;
    if (n < 0) continue;
    const c = col[n];
    const k = fromTop ? 0.5 : 0.32;
    const rgb = [c[0] * k * 0.6 + outC[0] * 0.4, c[1] * k * 0.6 + outC[1] * 0.4, c[2] * k * 0.6 + outC[2] * 0.4];
    put(g.l[n], i, rgb);
  }
  layers.forEach((c, i) => c.getContext('2d').putImageData(imgs[i], 0, 0));
  return { body: layers[0], front: layers[1] };
}

// ---------------------------------------------------------------------
// Override от PNG (по желание)
// ---------------------------------------------------------------------
const SHEET = { img: null, data: null, cfg: null };
const KEY = { '255,0,255': 'mid', '255,128,255': 'hi', '160,0,160': 'lo' };

export function setCharacterSheet(img, cfg) {
  const c = makeCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  SHEET.img = img;
  SHEET.data = x.getImageData(0, 0, img.width, img.height);
  SHEET.cfg = { cell: [FW, FH], poses: POSE_ORDER, ...(cfg || {}) };
}

function fromSheet(look, poseName, eyes, shirt) {
  const cfg = SHEET.cfg;
  const [cw, ch] = cfg.cell;
  const row = cfg.poses.indexOf(poseName);
  if (row < 0) return null;
  const rowsPerVariant = cfg.poses.length;
  const variants = Math.max(1, Math.floor(SHEET.img.height / (ch * rowsPerVariant)));
  const vy = (look.variant % variants) * rowsPerVariant * ch;
  const sx = (eyes === 'closed' && SHEET.img.width >= cw * 2) ? cw : 0, sy = vy + row * ch;
  if (sy + ch > SHEET.img.height) return null;
  const sh = ramp(shirt);
  const tone = { hi: hex2rgb(sh.hi), mid: hex2rgb(sh.mid), lo: hex2rgb(sh.lo) };
  const body = makeCanvas(FW, FH), front = makeCanvas(FW, FH);
  const id = body.getContext('2d').createImageData(cw, ch);
  const src = SHEET.data.data, W = SHEET.img.width;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = ((sy + y) * W + sx + x) * 4, di = (y * cw + x) * 4;
    let r = src[si], g2 = src[si + 1], b = src[si + 2];
    const k = KEY[`${r},${g2},${b}`];
    if (k) [r, g2, b] = tone[k];
    id.data[di] = r; id.data[di + 1] = g2; id.data[di + 2] = b; id.data[di + 3] = src[si + 3];
  }
  body.getContext('2d').putImageData(id, Math.round((FW - cw) / 2), FH - ch);
  return { body, front };
}

// ---------------------------------------------------------------------
// Кеш на кадрите
// ---------------------------------------------------------------------
export class CharacterSprites {
  constructor(look) { this.look = look; this.cache = new Map(); }
  frame(poseName, eyes, shirt) {
    const key = poseName + '|' + (eyes || '') + '|' + shirt;
    let f = this.cache.get(key);
    if (!f) {
      if (this.cache.size > 260) this.cache.clear();
      f = (SHEET.img && fromSheet(this.look, poseName, eyes, shirt)) || rasterize(compose(this.look, poseName, eyes), paletteFor(this.look, shirt));
      this.cache.set(key, f);
    }
    return f;
  }
}

/** Генерира целия атлас за един външен вид – полезно за преглед/експорт (вж. ?atlas). */
export function buildAtlas(look, shirt = '#4ac26b') {
  const cs = new CharacterSprites(look);
  const c = makeCanvas(FW * 2, FH * POSE_ORDER.length);
  const x = c.getContext('2d');
  POSE_ORDER.forEach((p, i) => {
    for (const [col, eyes] of [[0, 'open'], [1, 'closed']]) {
      const f = cs.frame(p, eyes === 'closed' ? 'closed' : null, shirt);
      x.drawImage(f.body, col * FW, i * FH); x.drawImage(f.front, col * FW, i * FH);
    }
  });
  return c;
}
