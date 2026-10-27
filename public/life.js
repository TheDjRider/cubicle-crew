// „Живот“ в офиса: малки истории, които никога не искат внимание.
//  – разговори с иконки (без думи) между почиващите в зоната за почивка
//  – радост, когато оркестратор свърши; под-агентът занася резултата на оркестратора, преди да си тръгне (office.leave)
//  – любимци с характер: сяда до чакащия, тича при радващия се, котката спи в слънчевия сноп или на празна клавиатура,
//    кучето носи топката на някого, който почива
//  – редки случки: птичка на перваза, куриер с пакет, торта при юбилейно извикване на инструмент
//  – разходка до библиотеката при WebFetch/WebSearch (рядко и кратко)
// Без частици/любимци/случки в режим „Фокус“; иконките не носят съдържание (поверителният режим не е засегнат).
import { CFG, PARAMS } from './config.js';
import { POD } from './layout.js';
import { CharacterSprites, lookFor, FH } from './sprites.js';
import { Actor } from './characters.js';
import { prefs } from './prefs.js';
import { R } from './util.js';

// където лицето се вижда и човекът стои/седи спокойно – там може да се говори
const TALKY = new Set(['sofa', 'coffee', 'cooler', 'lounge']);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// иконки в балончетата: 5x5, цифрата = цвят от c
const ICONS = {
  coffee: { c: ['#b8b8c8', '#f6f3ea', '#a08a70'], m: ['.1.1.', '..1..', '2222.', '22223', '.22..'] },
  heart: { c: ['#f28cb8'], m: ['11.11', '11111', '11111', '.111.', '..1..'] },
  note: { c: ['#3a3448'], m: ['.1111', '.1..1', '.1..1', '11.11', '11.11'] },
  sun: { c: ['#e0a43a'], m: ['1.1.1', '.111.', '11111', '.111.', '1.1.1'] },
  cat: { c: ['#5a5262', '#e0c24a'], m: ['1...1', '11111', '12121', '11111', '.111.'] },
  bulb: { c: ['#f0c850', '#8a8aa0'], m: ['.111.', '11111', '11111', '.111.', '.222.'] },
  pizza: { c: ['#c08040', '#f0c850', '#d84a3a'], m: ['11111', '23222', '.232.', '..2..', '.....'] },
  ball: { c: ['#e8e4dc', '#3a3448'], m: ['.121.', '11211', '22122', '11211', '.121.'] },
  star: { c: ['#f0c850'], m: ['..1..', '.111.', '11111', '.111.', '1...1'] },
  smile: { c: ['#3a3448'], m: ['.....', '.1.1.', '.....', '1...1', '.111.'] },
  paw: { c: ['#8a6a4a'], m: ['1.1.1', '.....', '.111.', '11111', '.111.'] },
  rain: { c: ['#4a8fe0', '#3a3448'], m: ['.111.', '11111', '..2..', '..2..', '.22..'] },
};
// разговорни теми: [начало, отговори…, край]
const TOPICS = [
  ['sun', 'smile', 'heart'], ['cat', 'heart', 'heart'], ['pizza', 'star', 'smile'], ['note', 'note', 'smile'],
  ['bulb', 'star', 'smile'], ['ball', 'smile', 'star'], ['coffee', 'coffee', 'smile'], ['paw', 'heart', 'smile'],
];

/** Балонче с иконка над главата (рисува се над нощния оттенък). k 0..1 = колко е „изскочило“. */
function drawSay(ctx, x, y, icon, k) {
  const I = ICONS[icon]; if (!I) return;
  const w = 9, h = 9, bx = x - 4, by = y - (k < 1 ? 1 : 0);
  R(ctx, '#2a2030', bx, by - 1, w, 1); R(ctx, '#2a2030', bx, by + h, w, 1); R(ctx, '#2a2030', bx - 1, by, 1, h); R(ctx, '#2a2030', bx + w, by, 1, h);
  R(ctx, '#f4f1e8', bx, by, w, h); R(ctx, '#dcd6c6', bx, by + h - 1, w, 1);
  R(ctx, '#f4f1e8', bx + 2, by + h, 2, 1); R(ctx, '#2a2030', bx + 1, by + h, 1, 1); R(ctx, '#2a2030', bx + 2, by + h + 1, 2, 1); // опашчица
  I.m.forEach((row, j) => { for (let i = 0; i < 5; i++) { const d = row[i]; if (d !== '.') R(ctx, I.c[+d - 1], bx + 2 + i, by + 2 + j, 1, 1); } });
}

export class Life {
  constructor(office) {
    this.o = office;
    const now = performance.now();
    this.nextChat = now + rnd(5000, 9000);
    this.chats = [];
    this.nextPet = now + rnd(9000, 16000);
    this.nextFollow = now + 4000;
    // редки случки: в демото първата идва скоро (да се види), иначе след няколко минути
    this.demo = !!PARAMS.demo;
    this.nextEvent = now + (this.demo ? rnd(7000, 12000) : rnd(150000, 360000));
    this.lastEvent = null;
    this.bird = null; this.courier = null; this.box = null;
    this.drops = [];     // играчки, донесени от кучето
    this.cakes = new Map();
  }

  // ================================================================ кадър
  update(dt, now) {
    const o = this.o;
    if (!o.L || !o.room) return;
    if (prefs.focus) { this.chats.length = 0; return; } // „Фокус“: без разговори, любимци и случки
    // някой чака -> „чака те“ е единственото, което мърда: разговорите спират, движенията и случките чакат
    Actor.hush = [...o.actors.values()].some((a) => a.vstate === 'waiting' && a.alpha > 0.5);
    if (Actor.hush || prefs.calm) { // „Спокоен офис“: същото, но винаги
      for (const c of this.chats) c.a.say = c.b.say = null;
      this.chats.length = 0;
      this.nextChat = Math.max(this.nextChat, now + 8000);
      this.nextEvent = Math.max(this.nextEvent, now + 20000);
    }
    this.chatTick(now);
    this.petTick(now);
    this.eventTick(dt, now);
    this.drops = this.drops.filter((d) => now < d.until);
    for (const [id, c] of this.cakes) if (now > c.until || !o.actors.has(id)) this.cakes.delete(id);
  }

  /** Нещо се движи бързо -> пълна честота (птичката лети, куриерът ходи, любимец подскача). */
  animating(now) {
    if (this.bird && this.bird.phase !== 'sit') return true;
    if (this.courier && this.courier.path.length) return true;
    return this.o.pets.some((p) => p.hop) || now - (this.o._petJumpAt || -1e9) < 400;
  }

  // ================================================================ разговори
  chatTick(now) {
    const o = this.o;
    // текущите разговори: следващата реплика; прекъсва, ако някой стане
    this.chats = this.chats.filter((c) => {
      const ok = (a) => o.actors.has(a.id) && a.mode === 'idleSpot' && a.agent.state === 'idle' && !a.leavingNow;
      if (!ok(c.a) || !ok(c.b)) { c.a.say = c.b.say = null; return false; }
      if (now < c.next) return true;
      if (c.i >= c.lines.length) return false;
      const sp = c.i % 2 ? c.b : c.a, ls = sp === c.a ? c.b : c.a;
      const dir = ls.x < sp.x ? 'l' : 'r';
      sp.say = { icon: c.lines[c.i], at: now, until: now + 1500 };
      sp.doReact('talk', 1300, now, 0, dir);
      ls.react = null; ls.gaze = { dir: dir === 'l' ? 'r' : 'l', until: now + 1700 }; ls.nextGaze = now + 2200;
      c.i++; c.next = now + 1750 + Math.random() * 300;
      return true;
    });
    if (now < this.nextChat) return;
    this.nextChat = now + rnd(9000, 20000);
    const free = o.live().filter((a) => a.agent.state === 'idle' && a.mode === 'idleSpot' && TALKY.has(a.loc.type) && a.alpha > 0.9 && !a.leavingNow &&
      !this.chats.some((c) => c.a === a || c.b === a));
    const pairs = [];
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++)
      if (Math.hypot(free[i].x - free[j].x, free[i].y - free[j].y) < 75) pairs.push([free[i], free[j]]);
    if (!pairs.length) return;
    const [a, b] = pick(pairs);
    // задрямалият на дивана се разбужда за разговора (иначе говори със спящ)
    for (const x of [a, b]) if (x.loc.type === 'sofa' && x.sofaAct === 'doze') { x.sofaAct = 'rest'; x.spotSince = now - 6000; }
    const wx = o.tod?.wx;
    const t = wx && (wx.rain || wx.storm) && Math.random() < 0.5 ? ['rain', 'coffee', 'smile'] : pick(TOPICS);
    this.chats.push({ a, b, lines: t, i: 0, next: now });
  }

  /** Балончетата с иконки (след частиците, над оттенъка). */
  drawOverlay(ctx, now) {
    if (prefs.focus) return;
    for (const a of this.o.actors.values()) {
      if (!a.say || a.alpha < 0.6 || now < a.say.at) continue;
      drawSay(ctx, Math.round(a.x), Math.round(a.y) - 44, a.say.icon, Math.min(1, (now - a.say.at) / 120));
    }
  }

  // ================================================================ радост и реакции
  /** Оркестратор свърши: той вдига ръце, екипът и почиващите се радват с него (разминато), любимец тича при него. */
  celebrate(a, now = performance.now()) {
    if (prefs.focus || !a) return;
    a.doReact('cheer', 1900, now);
    if (Actor.hush || prefs.calm) return; // някой чака (или „Спокоен офис“): радва се само той, без вълна от ръце и тичащ любимец
    for (const x of this.o.live()) {
      if (x === a || x.alpha < 0.9 || x.mode === 'walk' || x.leavingNow) continue;
      const team = this.o.leadOf(x) === a;
      if (team || x.agent.state === 'idle') x.doReact('cheer', 1200 + Math.random() * 500, now, 150 + Math.random() * 700, x.x < a.x ? 'r' : 'l');
    }
    const pet = this.freePet(a.x, a.y, true);
    if (pet) this.sendPet(pet, a, { rush: true, ms: 5500, hearts: true }, now);
  }

  /** Клик върху почиващ: маха ти и гледа към теб; работещ само поглежда. */
  greet(a, now = performance.now()) {
    if (!a || a.mode === 'walk') return;
    if (a.agent.state === 'idle') a.doReact('hi', 1500, now);
    else { a.gaze = null; a.nextGaze = now + 1600; }
  }

  // ================================================================ любимци
  /** Свободен любимец (без задача); dogFirst – кучето е по-отзивчиво. */
  freePet(x, y, dogFirst) {
    const ps = this.o.pets.filter((p) => p.placed && !p.busy && !p.hop);
    if (!ps.length) return null;
    if (dogFirst) { const d = ps.find((p) => p.kind === 'dog'); if (d) return d; }
    return ps.sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
  }

  /** Точки по пътеките от зоната за почивка до (tx, ty): по вертикалната пътека на зоната, после хоризонтално. */
  petPath(p, tx, ty) {
    const lx = this.o.L.lounge.x + 9;
    return [{ x: lx, y: p.y }, { x: lx, y: ty }, { x: tx, y: ty }];
  }

  /** Място до човек: пред бюрото му (долу вляво) или до него в зоната. */
  spotBy(a) {
    const L = this.o.L;
    if (a.isAtDesk(L)) { const p = L.pods[a.pod]; return { x: p.x + 8, y: p.y + 54, desk: true }; }
    if (a.loc.type === 'sofa') return { x: a.x + 10, y: L.lounge.sofa.base + 4 };
    return { x: a.x + 11, y: a.y + 2 };
  }

  sendPet(pet, a, o, now) {
    const s = this.spotBy(a), lo = this.o.L.lounge;
    const inLounge = !s.desk && s.x > lo.x + 8;
    const pts = inLounge ? [{ x: s.x, y: s.y }] : this.petPath(pet, s.x, s.y);
    pet.errand(pts, {
      rest: 'sit', rush: o.rush, ms: o.ms, end: o.end, face: s.x > a.x ? true : null,
      onArrive: (p, t) => { if (o.hearts) { this.o.fx.hearts(p.x, p.y - 16); p.pettedAt = t; } },
    }, now);
  }

  petTick(now) {
    const o = this.o;
    if (!o.pets.length) return;
    // чакащ теб: един любимец сяда до него, докато чака (кучето първо)
    for (const a of o.live()) {
      if (a.vstate !== 'waiting' || a.alpha < 0.9 || a.mode === 'walk' || o.pets.some((p) => p.job?.who === a.id)) continue;
      const pet = this.freePet(a.x, a.y, true);
      if (!pet) break;
      this.sendPet(pet, a, { ms: 120000, end: () => !o.actors.has(a.id) || a.vstate !== 'waiting' }, now);
      pet.job.who = a.id;
    }
    // котката понякога тръгва след минаващ през зоната
    if (now > this.nextFollow) {
      this.nextFollow = now + rnd(3000, 6000);
      const lo = o.L.lounge;
      const w = o.live().find((a) => a.mode === 'walk' && a.x > lo.x && a.path.length);
      const cat = w && o.pets.find((p) => p.kind === 'cat' && !p.busy && p.mode === 'sit');
      if (cat && Math.random() < 0.35) { const end = w.path[w.path.length - 1]; cat.goNear(end.x + (Math.random() < 0.5 ? -12 : 12), end.y + 6); }
    }
    if (now < this.nextPet) return;
    this.nextPet = now + (this.demo ? rnd(14000, 26000) : rnd(30000, 75000));
    const free = o.pets.filter((p) => p.placed && !p.busy && !p.hop);
    if (!free.length) return;
    const p = pick(free);
    const ideas = p.kind === 'dog' ? [() => this.fetch(p, now)] : [() => this.sunbeam(p, now), () => this.deskNap(p, now)];
    for (const f of ideas.sort(() => Math.random() - 0.5)) if (f()) return;
  }

  /** Котка: спи в слънчевия сноп на пода под някой прозорец. */
  sunbeam(p, now) {
    const tod = this.o.tod, room = this.o.room;
    if (!tod || PARAMS.clear || tod.daylight * (tod.sunny ?? 1) < 0.45 || !room.windows?.length) return false;
    const w = pick(room.windows), skew = Math.round((tod.h - 12.5) * -5);
    const tx = Math.round(w.x + w.w / 2 + skew * 0.35), ty = CFG.WALL_H + 13;
    p.errand(this.petPath(p, tx, ty), { rest: 'sit', sleepAfter: 2500, ms: rnd(50000, 110000), end: () => (this.o.tod?.daylight ?? 0) * (this.o.tod?.sunny ?? 1) < 0.3 }, now);
    return true;
  }

  /** Котка: скача на празно бюро и заспива на клавиатурата; слиза, щом някой дойде. */
  deskNap(p, now) {
    const o = this.o, L = o.L;
    const free = L.pods.filter((q) => ![...o.actors.values()].some((a) => a.pod === q.i) && !o.pets.some((x) => x.job?.pod === q.i));
    if (!free.length) return false;
    // по-скоро празно оркестраторско бюро (под-агентските се заемат често)
    const leads = free.filter((x) => x.role === 'lead');
    const q = pick(leads.length && Math.random() < 0.75 ? leads : free);
    const taken = () => [...o.actors.values()].some((a) => a.pod === q.i);
    p.errand(this.petPath(p, q.cx, q.aisleY), {
      rest: 'sit', sleepAfter: 1600, ms: rnd(60000, 140000), end: taken,
      // бюрото междувременно е заето -> не скача, прибира се
      onArrive: (c, t) => { if (taken()) { c.job.ms = 0; return; } c.jump(q.x + POD.keyboard.x + 8, q.y + POD.keyboard.y + 4, t); c.keyOverride = q.y + POD.depthDesk + 0.5; c.perched = true; o._petJumpAt = t; },
      onLeave: (c, t) => { if (!c.perched) return; c.jump(q.cx, q.aisleY, t); c.keyOverride = null; c.perched = false; o._petJumpAt = t; },
    }, now);
    p.job.pod = q.i;
    return true;
  }

  /** Куче: взима топката от играчките и я носи на някого, който почива; той се радва. */
  fetch(p, now) {
    const o = this.o, lo = o.L.lounge;
    const people = o.live().filter((a) => a.agent.state === 'idle' && a.mode === 'idleSpot' && ['sofa', 'lounge', 'coffee', 'cooler'].includes(a.loc.type) && a.alpha > 0.9);
    const ball = lo.pets?.toys?.find((t) => t.kind === 'ball');
    if (!people.length || !ball) return false;
    const who = pick(people);
    p.errand([{ x: ball.x + 3, y: ball.base + 1 }], {
      rest: 'sit', ms: 800,
      then: (d, t) => {
        if (!o.actors.has(who.id) || who.mode !== 'idleSpot') return null;
        d.carry = '#d84a3a';
        const s = this.spotBy(who);
        return {
          pts: [{ x: s.x, y: s.y }],
          o: {
            rest: 'sit', ms: 6000, face: s.x > who.x ? true : null,
            onArrive: (dd, tt) => {
              dd.carry = null; dd.pettedAt = tt;
              this.drops.push({ x: Math.round(dd.x) + (dd.flip ? -9 : 9), y: Math.round(dd.y), until: tt + 30000 });
              if (o.actors.has(who.id) && who.mode === 'idleSpot') { who.doReact('hi', 1400, tt, 250); o.fx.hearts(who.x, who.y - 34, 2); }
            },
          },
        };
      },
    }, now);
    return true;
  }

  // ================================================================ инструменти: разходка до библиотеката, торта
  onTool(ag, e, now = performance.now()) {
    const o = this.o, a = o.actors.get(ag.id);
    if (!a || !o.L) return;
    // юбилейно извикване (100, 250, 500…) на оркестратор -> торта на бюрото и малко радост
    if (!ag.subagent && [100, 250, 500, 1000, 2000, 5000].includes(ag.toolCalls) && !prefs.focus) this.cake(a, now);
    // WebFetch/WebSearch (и понякога дълго търсене): рядко става и отива до библиотеката
    const web = /^Web(Fetch|Search)$/.test(e.tool), grep = /^(Grep|Glob)$/.test(e.tool);
    if (!(web || grep) || !a.seat || !a.isAtDesk(o.L) || now - (a.lastTrip || -1e9) < 90000) return;
    if (Math.random() > (web ? 0.3 : 0.06) || o.live().some((x) => x.loc.type === 'books')) return;
    a.lastTrip = now;
    o.route(a, { type: 'books' });
  }

  cake(a, now) {
    this.cakes.set(a.id, { at: now, until: now + 45000 });
    a.doReact('cheer', 1600, now);
    if (a.isAtDesk(this.o.L)) { const p = this.o.L.pods[a.pod]; this.o.fx.sparkle(p.x + 10, p.y + 28, '#f0c850', 14); }
  }

  /** Тортата: на бюрото вляво от клавиатурата, свещичката трепти. */
  drawCake(ctx, p, who, now) {
    const c = who && this.cakes.get(who.id);
    if (!c) return;
    const x = p.x + 3, y = p.y + 30;
    R(ctx, 'rgba(16,10,24,0.3)', x, y + 6, 10, 1);
    R(ctx, '#f6f3ea', x, y + 1, 10, 5); R(ctx, '#e8a0b8', x, y + 1, 10, 2); R(ctx, '#c86a8a', x, y + 3, 10, 1);
    R(ctx, '#f6f3ea', x + 1, y + 3, 1, 1); R(ctx, '#f6f3ea', x + 5, y + 3, 1, 1); R(ctx, '#f6f3ea', x + 8, y + 3, 1, 1); // глазурата капе
    R(ctx, '#d84a3a', x + 3, y + 1, 1, 1); R(ctx, '#d84a3a', x + 7, y + 1, 1, 1);                                        // черешки
    R(ctx, '#4a8fe0', x + 5, y - 2, 1, 3);                                                                               // свещичка
    R(ctx, Math.floor((now + p.i * 77) / 180) % 3 ? '#ffd860' : '#ffb040', x + 5, y - 4, 1, 2);
  }

  /** Светлинки: свещичката на тортата. */
  glows(ctx, now, glow, night) {
    for (const [id] of this.cakes) {
      const a = this.o.actors.get(id); if (!a || !a.isAtDesk(this.o.L)) continue;
      const p = this.o.L.pods[a.pod];
      glow(ctx, p.x + 8, p.y + 26, 8, '#ffcf6a', 0.15 + 0.4 * night);
    }
  }

  // ================================================================ редки случки
  eventTick(dt, now) {
    const o = this.o;
    if (this.bird) this.birdTick(now);
    if (this.courier) this.courierTick(dt, now);
    if (this.box && now > this.box.until) this.box = null;
    if (now < this.nextEvent || this.bird || this.courier) return;
    const tod = o.tod || { daylight: 1, h: 12 };
    const kinds = [];
    if (!PARAMS.clear && tod.daylight > 0.35 && !(tod.wx && (tod.wx.rain || tod.wx.storm || tod.wx.snow)) && o.room.windows?.length) kinds.push('bird');
    if (tod.h >= 8 && tod.h < 19.5 && !this.box) kinds.push('courier');
    const k = pick(kinds.filter((x) => x !== this.lastEvent).length ? kinds.filter((x) => x !== this.lastEvent) : kinds);
    this.nextEvent = now + (this.demo ? rnd(60000, 120000) : rnd(240000, 540000));
    if (k) this.start(k, now);
  }

  /** Пуска случка веднага (и за ?debug: __office.life.start('bird')). */
  start(kind, now = performance.now()) {
    this.lastEvent = kind;
    const o = this.o;
    if (kind === 'bird') {
      const w = pick(o.room.windows);
      const sx = Math.round(w.x + 6 + Math.random() * Math.max(1, w.w - 14)), sy = w.y + w.h - 3;
      this.bird = { phase: 'in', t0: now, x0: w.x + w.w + 14, y0: w.y - 6, sx, sy, x: w.x + w.w + 14, y: w.y - 6, flip: true, stay: rnd(12000, 20000), hopAt: now + 2500, peckAt: 0 };
    } else if (kind === 'courier') {
      const L = o.L, d = L.door, topY = CFG.WALL_H + 9;
      const look = { ...lookFor('courier-7'), top: 'collar', bottom: 'pants', short: true, beard: null, acc: ['beanie'], accent: '#8a5e30', fem: false, hair: 'short' };
      this.courier = { sprites: new CharacterSprites(look), x: d.cx, y: d.floorY - 4, alpha: 0, fadeTo: 1, dist: 0, face: 'front', flip: false,
        path: [{ x: d.cx, y: d.floorY }, { x: d.cx, y: topY + 8 }], stage: 'in', at: now };
    } else if (kind === 'cake') {
      const a = o.live().find((x) => !x.agent.subagent && x.isAtDesk(o.L));
      if (a) this.cake(a, now);
    }
  }

  birdTick(now) {
    const b = this.bird, t = now - b.t0;
    if (b.phase === 'in') {
      const k = Math.min(1, t / 1600), e = 1 - (1 - k) * (1 - k);
      b.x = b.x0 + (b.sx - b.x0) * e; b.y = b.y0 + (b.sy - b.y0) * e - Math.sin(k * Math.PI) * 4; b.flip = true;
      if (k >= 1) { b.phase = 'sit'; b.t0 = now; }
    } else if (b.phase === 'sit') {
      // подскача, кълве, обръща се
      if (now > b.hopAt) { b.hopAt = now + rnd(1800, 4000); const r = Math.random(); if (r < 0.4) b.peckAt = now; else if (r < 0.7) b.flip = !b.flip; else b.x += b.flip ? -2 : 2; }
      if (t > b.stay) { b.phase = 'out'; b.t0 = now; b.ox = b.x; b.oy = b.y; b.flip = Math.random() < 0.5; }
    } else {
      const k = Math.min(1, t / 1400);
      b.x = b.ox + (b.flip ? -1 : 1) * 40 * k; b.y = b.oy - 30 * k * k;
      if (k >= 1) this.bird = null;
    }
  }

  /** Птичката – преди стаята (bg), така че се вижда само през стъклото, „отвън“ на перваза. */
  drawOutside(ctx, now) {
    const b = this.bird;
    if (!b) return;
    const x = Math.round(b.x), y = Math.round(b.y);
    ctx.save();
    if (b.flip) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); }
    const peck = b.phase === 'sit' && now - b.peckAt < 500 && Math.floor((now - b.peckAt) / 160) % 2 === 0;
    const fly = b.phase !== 'sit', wing = Math.floor(now / 90) % 2;
    R(ctx, '#6a4a32', x - 2, y - 3, 4, 2); R(ctx, '#8a6a4a', x - 1, y - 3, 2, 1); R(ctx, '#4a3424', x - 3, y - 3, 1, 1); // тяло, опашка
    R(ctx, '#e08a4a', x, y - 2, 2, 1);                                                                                  // червеногушка
    const hy = peck ? y - 3 : y - 4;
    R(ctx, '#6a4a32', x + 1, hy, 2, 2); R(ctx, '#1a1214', x + 2, hy, 1, 1); R(ctx, '#e0b040', x + 3, hy + 1, 1, 1);       // глава, око, човка
    if (fly) R(ctx, '#4a3424', x - 1, wing ? y - 5 : y - 1, 2, 1);
    else R(ctx, '#3a2a1a', x, y - 1, 1, 1);
    ctx.restore();
  }

  courierTick(dt, now) {
    const c = this.courier, L = this.o.L;
    const fs = dt * 2.2;
    c.alpha = c.fadeTo > c.alpha ? Math.min(c.fadeTo, c.alpha + fs) : Math.max(c.fadeTo, c.alpha - fs);
    if (c.path.length) {
      let left = CFG.WALK_SPEED * 0.8 * dt;
      while (left > 0 && c.path.length) {
        const p = c.path[0], dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
        if (d < 0.01) { c.path.shift(); continue; }
        c.face = Math.abs(dx) > Math.abs(dy) ? 'side' : dy > 0 ? 'front' : 'back'; if (c.face === 'side') c.flip = dx < 0;
        const m = Math.min(d, left); c.x += dx / d * m; c.y += dy / d * m; c.dist += m; left -= m;
        if (m >= d) c.path.shift();
      }
      if (!c.path.length) c.at = now;
      return;
    }
    const t = now - c.at;
    if (c.stage === 'in' && t > 600) { c.stage = 'drop'; c.at = now; this.box = { x: Math.round(c.x) + 9, y: Math.round(c.y) + 1, until: now + (this.demo ? 90000 : 180000) }; }
    else if (c.stage === 'drop' && t > 1500) { c.stage = 'out'; c.path = [{ x: L.door.cx, y: L.door.floorY }]; }
    else if (c.stage === 'out') { c.fadeTo = 0; if (c.alpha <= 0) this.courier = null; }
  }

  courierPose(now) {
    const c = this.courier;
    if (c.path.length) {
      const f = Math.floor(c.dist / 3.2) % 4;
      if (c.stage === 'in') return 'walkBoxF' + f;
      return c.face === 'side' ? 'walkS' + f : (c.face === 'back' ? 'walkB' : 'walkF') + f;
    }
    if (c.stage === 'in') return 'standBox';
    if (c.stage === 'drop') return Math.floor((now - c.at) / 240) % 2 ? 'standHiB' : 'standHiA';
    return 'stand';
  }

  /** Куриерът е до вратата (отваря я). */
  nearDoor() { const c = this.courier, d = this.o.L.door; return !!c && Math.abs(c.x - d.cx) < 10 && c.y < d.floorY + 14; }

  /** Динамични неща за сортирането по дълбочина: куриерът, пакетът, донесената топка. */
  items(push, ctx, now) {
    const c = this.courier;
    if (c && c.alpha > 0) push(c.y, () => {
      const f = c.sprites.frame(this.courierPose(now), null, '#b07a3a');
      const x = Math.round(c.x) - 12, y = Math.round(c.y) - (FH - 1);
      ctx.fillStyle = `rgba(16,10,24,${0.3 * c.alpha})`; ctx.fillRect(Math.round(c.x) - 5, Math.round(c.y), 11, 2);
      ctx.globalAlpha = c.alpha;
      if (c.flip) { ctx.save(); ctx.translate(x + 24, 0); ctx.scale(-1, 1); ctx.drawImage(f.body, 0, y); ctx.drawImage(f.front, 0, y); ctx.restore(); }
      else { ctx.drawImage(f.body, x, y); ctx.drawImage(f.front, x, y); }
      ctx.globalAlpha = 1;
    });
    const b = this.box;
    if (b) push(b.y, () => {
      R(ctx, 'rgba(16,10,24,0.3)', b.x - 1, b.y, 11, 1);
      R(ctx, '#c8945a', b.x, b.y - 7, 9, 7); R(ctx, '#e0b07a', b.x, b.y - 7, 9, 1); R(ctx, '#8a5e30', b.x + 8, b.y - 6, 1, 6);
      R(ctx, '#8a5e30', b.x + 4, b.y - 7, 1, 7); R(ctx, '#f6f3ea', b.x + 1, b.y - 4, 2, 2);
    });
    for (const d of this.drops) push(d.y, () => { R(ctx, 'rgba(16,10,24,0.3)', d.x - 1, d.y, 4, 1); R(ctx, '#d84a3a', d.x - 1, d.y - 3, 3, 3); R(ctx, '#ffffff', d.x - 1, d.y - 3, 1, 1); });
  }
}
