// „Побутни“ предметите: клик по мебел/уред в офиса -> малка анимация + тих звук (sound.js, без файлове).
// Кафемашината вари чашка, растението шумоли, принтерът печата лист, аквариумът – рибките се стрелват,
// прозорецът се отваря/затваря (птички/щурци във фоновия звук), часовникът кука, на вратата се чука…
// Не пречи на съществуващите кликове (дъската, ключовете, метеостанцията, любимците) – ui.js пита тук последно.
// Във „Фокус“ няма побутване (тихо табло). Всяка анимация е кратка; докато върви, office.animating() връща true.
import { PARAMS } from './config.js';
import { prefs } from './prefs.js';
import { ENV } from './palette.js';
import { R } from './util.js';
import { drawSky } from './environment.js';
import { sfx } from './sound.js';

// предмет (име на prop) -> вид отклик; ms = колко трае анимацията
const KIND = {
  bookshelf: { act: 'shelf', ms: 450, snd: 'page' },
  counter: { act: 'brew', ms: 2600, snd: 'brew' },
  cooler: { act: 'glug', ms: 700, snd: 'glug' },
  plant_big: { act: 'rustle', ms: 720, snd: 'rustle' },
  plant_small: { act: 'rustle', ms: 720, snd: 'rustle' },
  arcade: { act: 'arcade', ms: 1500, snd: 'arcade' },
  aquarium: { act: 'tap', ms: 1500, snd: 'tink' },
  massage: { act: 'buzz', ms: 1400, snd: 'whirr' },
  sofa_back: { act: 'poof', ms: 350, snd: 'poof' },
  sofa_front: { act: 'poof', ms: 350, snd: 'poof' },
  table: { act: 'shelf', ms: 300, snd: 'thud' },
  floor_lamp: { act: 'lamp', ms: 0, snd: 'click' },
  season: { act: 'jingle', ms: 600, snd: 'jingle' },
  pet_fountain: { act: 'splash', ms: 500, snd: 'splash' },
  pet_bowl: { act: 'treat', ms: 300, snd: 'bloop' },
  toy_yarn: { act: 'hop', ms: 420, snd: 'squeak' },
  toy_mouse: { act: 'hop', ms: 420, snd: 'squeak' },
  toy_bone: { act: 'hop', ms: 420, snd: 'squeak' },
  toy_ball: { act: 'hop', ms: 420, snd: 'squeak' },
  printer: { act: 'print', ms: 4200, snd: 'print' },
  shredder: { act: 'shred', ms: 0, snd: 'shred' },
};
// разклащане 1 px (рафт, маса) и шумолене на растение
const SHAKE = [1, -1, 1, -1, 1, 0, -1, 0];
const HOP = [-2, -3, -2, -1, 0];

export class Pokes {
  constructor(office) {
    this.office = office;
    this.anims = [];          // { o?, kind, at, until, … }
    this.open = new Set();    // индекси на отворените прозорци (до презареждане)
    this.cuckooAt = -1e9; this.doorUntil = 0; this.knockAt = -1e9;
  }

  /** Може ли да се побутва изобщо (не във „Фокус“, не в прозрачния фон за стените). */
  get on() { return !prefs.focus && !PARAMS.overlay; }

  /** Какво има под точката (логически пиксели) – предмет, прозорец, часовник или врата; null – нищо. */
  at(x, y) {
    if (!this.on) return null;
    const room = this.office.room;
    if (!room) return null;
    // най-предният предмет (по дълбочина), по истинските пиксели на картинката
    let best = null;
    for (const o of room.objects) {
      const k = KIND[o.name];
      if (!k || x < o.x || y < o.y || x >= o.x + o.img.width || y >= o.y + o.img.height) continue;
      if (!opaque(o.img, x - o.x, y - o.y)) continue;
      if (!best || o.key > best.o.key) best = { type: 'obj', o, name: o.name };
    }
    if (best) return best;
    if (PARAMS.clear) return null; // без стени: няма прозорци, часовник и врата
    for (const [i, w] of room.windows.entries()) if (x >= w.x - 1 && x < w.x + w.w + 1 && y >= w.y - 1 && y < w.y + w.h + 1) return { type: 'window', i, name: 'window' };
    const c = room.clock;
    if (c && Math.hypot(x - c.x, y - c.y) <= c.r + 1) return { type: 'clock', name: 'clock' };
    const d = room.door;
    if (d && x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return { type: 'door', name: 'door' };
    return null;
  }

  /** Клик: анимация + звук. Връща true, ако е хванат. onTreat – купичката (лакомство за любимец, ui.js). */
  poke(hit, now = performance.now()) {
    if (!hit) return false;
    const room = this.office.room, W = room.W;
    const pan = (x) => (x / W) * 1.4 - 0.7;
    if (hit.type === 'window') {
      if (this.open.has(hit.i)) this.open.delete(hit.i); else this.open.add(hit.i);
      const w = room.windows[hit.i];
      this.anims.push({ kind: 'window', i: hit.i, at: now, until: now + 300 });
      sfx('window', pan(w.x + w.w / 2));
      return true;
    }
    if (hit.type === 'clock') { this.cuckooAt = now; sfx('cuckoo', pan(room.clock.x)); return true; }
    if (hit.type === 'door') { this.knockAt = now; this.doorUntil = now + 1300; sfx('knock', pan(room.door.x)); return true; }
    const o = hit.o, k = KIND[o.name], cx = o.x + o.img.width / 2;
    // повторен клик по време на дълга анимация (кафе, принтер) – само звукът не се повтаря
    const prev = this.anims.find((a) => a.o === o);
    if (prev && (k.act === 'brew' || k.act === 'print') && now < prev.until - 1500) return true;
    if (prev) this.anims.splice(this.anims.indexOf(prev), 1);
    const fx = this.office.fx;
    switch (k.act) {
      case 'lamp': this.office.toggleLamp(); break;
      case 'shred': if (room.shredder) room.shredder.chewAt = now; break;
      case 'tap': if (room.aquarium) { const aq = room.aquarium; aq.tapBase = (aq.tapBase || 0) + 2600; aq.tapAt = now; } break;
      case 'arcade': if (room.arcade) room.arcade.pokeAt = now; fx.sparkle(cx, o.y + 4, '#f0d040', 8); break;
      case 'glug': for (let i = 0; i < 6; i++) setTimeout(() => fx.bubble(o.x + 5 + Math.random() * 4, o.y + 6 + Math.random() * 8), i * 110); break;
      case 'rustle': for (let i = 0; i < 3; i++) fx.add({ kind: 'px', layer: 'top', x: o.x + 6 + Math.random() * (o.img.width - 12), y: o.y + 4 + Math.random() * 8, vx: (Math.random() - 0.5) * 10, vy: -4, g: 22, life: 1.4, color: Math.random() < 0.5 ? '#4a9a4a' : '#6ab85a', wobble: 1, size: 1 }); break;
      case 'shelf': for (let i = 0; i < 4; i++) fx.dust(o.x + Math.random() * o.img.width, o.y + Math.random() * 10); break;
      case 'poof': for (let i = 0; i < 5; i++) fx.add({ kind: 'px', layer: 'top', x: cx, y: o.y + 4, vx: (Math.random() - 0.5) * 24, vy: -6 - Math.random() * 6, g: 0, drag: 2, life: 0.7, color: '#e8e0d0', alpha: 0.6, size: 1 }); break;
      case 'splash': for (let i = 0; i < 5; i++) fx.add({ kind: 'px', layer: 'top', x: cx, y: o.y + 2, vx: (Math.random() - 0.5) * 20, vy: -14 - Math.random() * 8, g: 70, life: 0.6, color: '#8ad0f0', size: 1 }); break;
      case 'jingle': fx.sparkle(cx, o.y + 6, '#ffe27a', 10); break;
      case 'treat': break; // ui.js решава (лакомство за монети)
      default: break;
    }
    if (k.ms) this.anims.push({ o, kind: k.act, at: now, until: now + k.ms });
    if (k.act !== 'treat') sfx(k.snd, pan(cx));
    return true;
  }

  /** Върви ли анимация (за пълна честота на кадрите в main.js). */
  active(now) {
    this.anims = this.anims.filter((a) => now < a.until);
    return this.anims.length > 0 || now - this.cuckooAt < 1500 || now < this.doorUntil;
  }

  /** Отместване на предмета сега (разклащане / подскок), за рисуването в office.render. */
  offset(o, now) {
    for (const a of this.anims) {
      if (a.o !== o) continue;
      const t = now - a.at;
      if (a.kind === 'shelf' || a.kind === 'poof') return { x: SHAKE[Math.floor(t / 50) % SHAKE.length] * (a.kind === 'poof' ? 0 : 1), y: a.kind === 'poof' && t < 160 ? 1 : 0 };
      if (a.kind === 'buzz') return { x: Math.floor(t / 45) % 2, y: 0 };
      if (a.kind === 'hop') return { x: 0, y: HOP[Math.min(HOP.length - 1, Math.floor(t / 85))] };
      if (a.kind === 'glug') return { x: 0, y: 0 };
    }
    return null;
  }

  /** Растение: бързо шумолене горната част (вместо бавното полюшване). */
  rustle(o, now) {
    const a = this.anims.find((x) => x.o === o && x.kind === 'rustle');
    return a ? SHAKE[Math.floor((now - a.at) / 90) % SHAKE.length] : 0;
  }

  /** Броят отворени прозорци и x на първия (за птичките/щурците във фона). */
  openWindows() { return this.open.size; }
  openX() { const w = this.office.room.windows[[...this.open][0]]; return w ? w.x + w.w / 2 : 0; }

  /** Стената: отворените крила на прозорците и кукувицата (след фона, преди хората). */
  drawWall(ctx, room, tod, now) {
    for (const i of this.open) {
      const w = room.windows[i];
      if (!w || w.h < 36) continue;
      const mx = w.x + Math.floor(w.w / 2);
      // дясното крило е отворено навътре: зад него се вижда небето (отново, само в тази част)
      ctx.save();
      ctx.beginPath(); ctx.rect(mx, w.y + 1, w.x + w.w - 1 - mx, w.h - 2); ctx.clip();
      drawSky(ctx, room, tod, now);
      ctx.restore();
      // крилото отстрани, в перспектива (тясно)
      const F = ENV.frame, FD = ENV.frameDk, lx = w.x + w.w - 1;
      R(ctx, FD, lx, w.y - 2, 5, w.h + 3);
      R(ctx, F, lx + 1, w.y - 1, 3, w.h + 1);
      R(ctx, 'rgba(190,215,255,0.35)', lx + 2, w.y + 1, 1, w.h - 3);
      R(ctx, FD, lx + 1, w.y + Math.round(w.h * 0.34), 3, 1); R(ctx, FD, lx + 1, w.y + Math.round(w.h * 0.67), 3, 1);
      R(ctx, '#d8c070', lx, w.y + Math.round(w.h * 0.5), 1, 3);
    }
    // кукувицата: птичката излиза от часовника и се прибира
    const t = now - this.cuckooAt, c = room.clock;
    if (c && t < 1500) {
      const out = t < 150 ? t / 150 : t > 1300 ? (1500 - t) / 200 : 1, bob = Math.floor(t / 275) % 2;
      const bx = c.x - 2 - Math.round(out * 3), by = c.y - 1 - bob;
      R(ctx, '#2a2030', c.x - 2, c.y - 2, 4, 4);                     // вратичката
      R(ctx, '#e0b84a', bx, by, 4, 3); R(ctx, '#f0d070', bx + 1, by, 2, 1);
      R(ctx, '#e07a4a', bx - 1, by + 1, 1, 1); R(ctx, '#1d1626', bx + 1, by + 1, 1, 1);
    }
  }

  /** Динамичните части по дълбочина: чаша и струя в кафемашината, лист от принтера. */
  items(list, ctx, now) {
    for (const a of this.anims) {
      const o = a.o;
      if (a.kind === 'brew') list.push({ key: o.key + 0.6, fn: () => drawBrew(ctx, o, now - a.at, this.office.decor?.espresso) });
      else if (a.kind === 'print') list.push({ key: o.key + 0.6, fn: () => drawPrint(ctx, o, now - a.at) });
    }
  }

  /** Пара над готовото кафе (частици, ако не са изключени). */
  update(now) {
    for (const a of this.anims) {
      if (a.kind !== 'brew' || now - a.at < 1500) continue;
      if (!a.steam || now - a.steam > 180) { a.steam = now; const s = brewSpot(a.o, this.office.decor?.espresso); this.office.fx.steam(s.x, s.y - 3); }
    }
  }
}


/** Пикселът на картинката непрозрачен ли е (маската се смята веднъж за предмет). */
function opaque(img, x, y) {
  if (!img._alpha) {
    try { img._alpha = img.getContext('2d').getImageData(0, 0, img.width, img.height).data; } catch { return true; }
  }
  // 1 px поле около непрозрачното – тънките предмети (лампата) се хващат по-лесно
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const px = Math.floor(x) + dx, py = Math.floor(y) + dy;
    if (px >= 0 && py >= 0 && px < img.width && py < img.height && img._alpha[(py * img.width + px) * 4 + 3] > 40) return true;
  }
  return false;
}

// кафемашината (drawCounter в environment.js): машината е на (3, h-38), чучурът ~ +7, чашката ~ +12 отдолу
function brewSpot(o, pro) {
  const top = o.img.height - 20, my = top - 18;
  return pro ? { x: o.x + 3 + 4, y: o.y + my + 13 } : { x: o.x + 3 + 7, y: o.y + my + 12 };
}
function drawBrew(ctx, o, t, pro) {
  const s = brewSpot(o, pro);
  // струя кафе (2-ри – 1.4-та s), чашата се пълни
  if (t > 250 && t < 1500) R(ctx, '#5a3420', s.x, s.y - 3, 1, 3 + (Math.floor(t / 90) % 2));
  const fill = Math.max(0, Math.min(2, Math.floor((t - 300) / 450)));
  R(ctx, '#f4f1e8', s.x - 1, s.y, 3, 3); R(ctx, '#c9c2b0', s.x - 1, s.y + 2, 3, 1);
  if (fill) R(ctx, '#6a3e22', s.x, s.y + 2 - fill, 1, fill);
  // готово: малка зелена лампичка мига
  if (t > 1500 && Math.floor(t / 250) % 2) R(ctx, '#4ac26b', o.x + 3 + (pro ? 1 : 11), o.y + o.img.height - 38 + 5, pro ? 1 : 2, 1);
}
// принтерът (drawPrinter): изходът е на (5, h-19); листът излиза за ~1.2 s и стои малко
function drawPrint(ctx, o, t) {
  const h = o.img.height, w = o.img.width;
  const k = Math.min(1, t / 1200), out = Math.round(k * 6);
  if (t > 3600) return;
  const x = o.x + 6, y = o.y + h - 18;
  R(ctx, '#f6f3ea', x, y, w - 12, out);
  if (out > 2) { R(ctx, '#9a9aaa', x + 2, y + 1, w - 18, 1); R(ctx, '#9a9aaa', x + 2, y + 3, w - 20, 1); }
  if (out > 4) R(ctx, '#4a8fe0', x + 2, y + 5, 3, 1);
  R(ctx, '#c9c2b0', x, y + out, w - 12, out ? 1 : 0);
}
