// Емблеми на екипите: малки пикселни иконки (7x7), по една на оркестратор – по тях се познава чий е под-агентът
// (флагче на бюрото на оркестратора, стикер на бюрата на екипа, иконка в етикетите). Цветът на ризата остава за
// състоянието, затова екипът се различава по форма. Избира се по името на проекта, но двама в офиса не носят една.
import { makeCanvas } from './util.js';

const I = (id, pal, map) => ({ id, pal, map });
export const EMBLEMS = [
  I('fox', { o: '#e07a2a', w: '#f4ece0', K: '#1a1214' }, ['o.....o', 'oo...oo', 'ooooooo', 'oKoooKo', '.owwwo.', '..wKw..', '...w...']),
  I('owl', { b: '#f4f4fa', s: '#8a8aa0', Y: '#f0c840', K: '#1a1214', o: '#e0a040' }, ['s.....s', 'bbbbbbb', 'bYbbbYb', 'bKbobKb', '.bsbsb.', '.bbsbb.', '..o.o..']),
  I('rocket', { w: '#e8e8f0', r: '#e04a4a', B: '#4a8fe0', y: '#f0c840' }, ['...r...', '..www..', '..wBw..', '..www..', '.rwwwr.', 'r.www.r', '..y.y..']),
  I('cactus', { g: '#3e8a46', G: '#6ac06a', p: '#c0703a', P: '#e0985a' }, ['...g...', '.g.gG..', '.gggg.g', '...gGgg', '...g...', '..PPP..', '..ppp..']),
  I('whale', { b: '#3a6ab0', B: '#6a9ae0', w: '#e8f0f8', K: '#1a1214' }, ['.....w.', '....w.w', '.bbbb..', 'bbKbbbb', 'bBBBBbb', '.bbbbb.', '.......']),
  I('mushroom', { r: '#d04040', w: '#f4f0e8', s: '#e8dcc4', d: '#a89878' }, ['..rrr..', '.rwrrr.', 'rrrrwrr', 'rwrrrrr', '..sss..', '..sds..', '..sss..']),
  I('bee', { y: '#f0c840', K: '#2a2226', w: '#dceaf4' }, ['.w...w.', '.ww.ww.', '..yKy..', '.yKyKy.', '.yKyKy.', '..yKy..', '...K...']),
  I('ghost', { w: '#ece8f8', s: '#b8b0d8', K: '#2a2236' }, ['..www..', '.wwwww.', 'wKwwKww', 'wwwwwww', 'wwswwsw', 'wwwwwww', 'w.w.w.w']),
];

const cache = new Map();
/** Иконката като канвас 7x7. */
export function emblemCanvas(i) {
  const k = 'c' + i;
  if (!cache.has(k)) {
    const e = EMBLEMS[i % EMBLEMS.length], c = makeCanvas(7, 7), g = c.getContext('2d');
    e.map.forEach((row, y) => [...row].forEach((ch, x) => { if (e.pal[ch]) { g.fillStyle = e.pal[ch]; g.fillRect(x, y, 1, 1); } }));
    cache.set(k, c);
  }
  return cache.get(k);
}
/** За DOM етикетите – data URL (рисуван тук, без файлове). */
export function emblemUrl(i) {
  const k = 'u' + i;
  if (!cache.has(k)) cache.set(k, emblemCanvas(i).toDataURL());
  return cache.get(k);
}
/** Стикер 9x9 (рамка + иконка) – на предния панел на бюрата на екипа. */
export function drawSticker(ctx, x, y, i) {
  ctx.fillStyle = '#2a2236'; ctx.fillRect(x, y, 9, 9);
  ctx.fillStyle = '#f0e8d0'; ctx.fillRect(x + 1, y + 1, 7, 7);
  ctx.drawImage(emblemCanvas(i), x + 1, y + 1);
}
