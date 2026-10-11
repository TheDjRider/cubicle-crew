// Иконата на приложението като пиксел-арт: член на екипа маха над стената на кабинката,
// по горния ръб на стената е лентата с цветовете на състоянията (както в логото).
// Две рисунки: 32x32 (големите размери) и 16x16 (трей, 16/48 px) – умаленото 32 не се чете.
// rect(x, y, w, h, [r, g, b, a]) рисува в "арт пиксели"; ползват го scripts/make-icon.mjs и трея в main.js.

const hex = (h, a = 255) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const C = {
  edge: hex('#0e0a16'), bgTop: hex('#43357a'), bgBot: hex('#211a38'), stripe: hex('#ffffff', 14),
  hairD: hex('#4a2a1a'), hair: hex('#7a4a2a'), hairL: hex('#a8683a'),
  skin: hex('#f4c99c'), skinD: hex('#d79f70'), eye: hex('#1d1626'), shine: hex('#ffffff'), cheek: hex('#f29a86'), mouth: hex('#8a3446'),
  shirt: hex('#4ac26b'), shirtD: hex('#2e8a4a'),
  panel: hex('#5b6685'), panelD: hex('#3b415c'), panelL: hex('#6f7a9c'),
  gold: hex('#f0c040'), goldD: hex('#a87a18'), star: hex('#fff6d0'),
  mug: hex('#ece6da'), mugD: hex('#b8ae9e'), steam: hex('#ffffff', 150),
};
// цветовете на състоянията (STATES в public/config.js) – по реда в легендата
const STATE = ['#6b6b80', '#e0c24a', '#4ac26b', '#4a8fe0', '#e07a4a', '#b04ae0', '#e04a6b'].map((h) => hex(h));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Плочка със заоблени ъгли и вертикален градиент. */
function tile(rect, n, r) {
  for (let y = 0; y < n; y++) {
    const cut = y < r ? r - y : y >= n - r ? y - (n - r - 1) : 0;
    rect(cut, y, n - 2 * cut, 1, C.edge);
    if (y > 0 && y < n - 1) rect(cut + 1, y, n - 2 * cut - 2, 1, mix(C.bgTop, C.bgBot, y / (n - 1)));
  }
}

export function drawIcon32(rect) {
  tile(rect, 32, 3);
  for (let x = 4; x < 29; x += 5) rect(x, 3, 2, 17, C.stripe); // тапет
  // чаша кафе вляво, с пара
  rect(4, 17, 4, 4, C.mug); rect(7, 17, 1, 4, C.mugD); rect(3, 18, 1, 2, C.mugD); rect(4, 17, 3, 1, hex('#5a3420'));
  rect(5, 14, 1, 2, C.steam); rect(6, 12, 1, 2, C.steam);
  // ръка, която маха (зад рамото)
  rect(23, 15, 2, 6, C.shirt); rect(24, 14, 2, 2, C.shirt); rect(25, 15, 1, 5, C.shirtD);
  rect(24, 10, 4, 4, C.skin); rect(24, 9, 1, 1, C.skin); rect(26, 9, 1, 1, C.skin); rect(28, 11, 1, 2, C.skin); rect(27, 13, 1, 1, C.skinD);
  // тяло (риза в "пише" зелено)
  rect(10, 19, 12, 1, C.shirt); rect(8, 20, 16, 2, C.shirt); rect(8, 20, 1, 2, C.shirtD); rect(23, 20, 1, 2, C.shirtD);
  rect(14, 18, 4, 2, C.skinD); // шия
  // глава
  rect(10, 8, 12, 9, C.skin); rect(11, 17, 10, 1, C.skin); rect(21, 9, 1, 8, C.skinD); rect(12, 17, 8, 1, C.skinD);
  rect(9, 12, 1, 2, C.skinD); rect(22, 12, 1, 2, C.skinD); // уши
  // коса
  rect(12, 4, 8, 1, C.hairD); rect(10, 5, 12, 1, C.hair); rect(9, 6, 14, 2, C.hair); rect(9, 8, 14, 1, C.hair);
  rect(9, 9, 1, 3, C.hair); rect(22, 9, 1, 3, C.hair); rect(10, 9, 1, 1, C.hair); rect(21, 9, 1, 1, C.hair);
  rect(12, 8, 2, 1, C.skin); rect(17, 8, 1, 1, C.skin); // бретон
  rect(9, 5, 1, 1, C.hairD); rect(22, 5, 1, 1, C.hairD); rect(9, 6, 1, 6, C.hairD); rect(22, 6, 1, 6, C.hairD);
  rect(13, 5, 3, 1, C.hairL); rect(12, 6, 2, 1, C.hairL);
  // лице
  rect(12, 11, 2, 2, C.eye); rect(18, 11, 2, 2, C.eye); rect(12, 11, 1, 1, C.shine); rect(18, 11, 1, 1, C.shine);
  rect(11, 14, 2, 1, C.cheek); rect(19, 14, 2, 1, C.cheek);
  rect(13, 14, 1, 1, C.mouth); rect(14, 15, 4, 1, C.mouth); rect(18, 14, 1, 1, C.mouth);
  // стената на кабинката: лента със състоянията, плат, табелка със звезда (главният агент)
  STATE.forEach((c, i) => rect(2 + i * 4, 21, 4, 2, c));
  for (let y = 23; y < 31; y++) {
    const cut = y >= 29 ? y - 28 + 1 : 0;
    rect(1 + cut, y, 30 - 2 * cut, 1, y === 23 ? C.panelD : C.panel);
  }
  rect(1, 23, 30, 1, C.panelD);
  for (let y = 25; y < 29; y += 2) for (let x = 3 + (y % 4 ? 1 : 0); x < 29; x += 3) rect(x, y, 1, 1, C.panelL);
  rect(10, 24, 12, 5, C.goldD); rect(11, 24, 10, 4, C.gold);
  // звезда 5x4: ..x.. / xxxxx / .xxx. / .x.x.
  rect(16, 24, 1, 1, C.star); rect(14, 25, 5, 1, C.star); rect(15, 26, 3, 1, C.star); rect(15, 27, 1, 1, C.star); rect(17, 27, 1, 1, C.star);
  // контурът на плочката отдолу остава видим
  rect(3, 31, 26, 1, C.edge); rect(1, 29, 1, 1, C.edge); rect(30, 29, 1, 1, C.edge); rect(2, 30, 1, 1, C.edge); rect(29, 30, 1, 1, C.edge);
}

export function drawIcon16(rect) {
  tile(rect, 16, 2);
  // ръка, която маха
  rect(12, 4, 2, 2, C.skin); rect(12, 6, 1, 3, C.shirt);
  // тяло и глава
  rect(4, 9, 8, 2, C.shirt);
  rect(5, 4, 6, 5, C.skin); rect(10, 5, 1, 4, C.skinD);
  rect(5, 2, 6, 1, C.hair); rect(4, 3, 8, 1, C.hair); rect(4, 4, 1, 2, C.hair); rect(11, 4, 1, 2, C.hair); rect(5, 4, 2, 1, C.hair); rect(8, 4, 3, 1, C.hair);
  rect(6, 6, 1, 1, C.eye); rect(9, 6, 1, 1, C.eye); rect(7, 8, 2, 1, C.mouth);
  // лента със състоянията + стена + табелка
  STATE.forEach((c, i) => rect(1 + i * 2, 11, 2, 1, c));
  rect(1, 12, 14, 2, C.panel); rect(2, 14, 12, 1, C.panel);
  rect(6, 12, 4, 2, C.gold);
}
