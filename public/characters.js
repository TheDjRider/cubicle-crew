// Героите в сцената: движение, поведение по състояния, рисуване.
// (Спрайтовете се генерират в sprites.js; тук се решава КОЯ поза кога.)
import { CFG, STATES } from './config.js';
import { CharacterSprites, lookFor, FW, FH } from './sprites.js';
import { mix, rgba } from './palette.js';
import { R, clamp } from './util.js';
import { drawText } from './pixelfont.js';
import { prefs } from './prefs.js';

const frameAt = (t, ms, n = 2) => Math.floor(t / ms) % n;

/** Поза за седнал герой според състоянието и колко време е в него (lt). */
function seatedPose(st, lt, t, a) {
  if (lt < 140) return 'sit'; // кратък неутрален кадър = без "скок" между пози
  switch (st) {
    case 'typing': {
      const c = (lt + a.phase) % 7200;
      if (c > 6300) return 'leanBack';
      return frameAt(t, 110) ? 'typeA' : 'typeB';
    }
    case 'running': return frameAt(t, 75) ? 'typeA' : 'typeB';
    case 'reading': return ((lt + a.phase) % 2600) > 2250 ? 'readB' : 'readA';
    case 'thinking': {
      const c = (lt + a.phase) % 5200;
      if (c < 2200) return 'chin';
      if (c < 3800) return frameAt(t, 170) ? 'scratchA' : 'scratchB';
      return 'chin';
    }
    case 'delegating': {
      const c = lt % 4200;
      if (c < 2700) return frameAt(t, 210) ? 'writeA' : 'writeB';
      if (c < 3300) return 'throw';
      return 'sit';
    }
    case 'waiting':
      if (lt > 8000) return frameAt(t, 210) ? 'waveBothA' : 'waveBothB';
      return frameAt(t, 260) ? 'waveA' : 'waveB';
    default: { // idle
      if (lt > 16000) return 'doze';
      const c = (lt + a.phase) % 15000;
      if (c < 3000) return 'sit';
      if (c < 4500) return 'sip';
      if (c < 8500) return 'sit';
      if (c < 9700) return 'stretch';
      if (c < 13000) return 'sit';
      return 'sip';
    }
  }
}

/** Дартс: цикъл от DART_CYCLE мс – прицелва се, хвърля (в DART_RELEASE), сваля ръката. */
export const DART_CYCLE = 1800, DART_RELEASE = 1000;
function dartPose(st) {
  if (st < 600) return 'standBack';
  const c = st % DART_CYCLE;
  return c < DART_RELEASE ? 'dartAim' : c < DART_RELEASE + 400 ? 'dartThrow' : 'standBack';
}

export class Actor {
  constructor(agent, office) {
    this.agent = agent;
    this.id = agent.id;
    this.office = office;
    // всички са случайни по id; аватарът на потребителя се слага само на първия оркестратор (office.syncAvatar)
    this.setLook(lookFor(agent.id, !!agent.subagent));
    this.pod = -1;
    this.x = 0; this.y = 0;
    this.mode = 'seated';          // seated | walk | idleSpot | pace | gone
    this.loc = { type: 'seat' };   // къде е/отива
    this.path = [];
    this.walkDist = 0;
    this.face = 'front'; this.flip = false;
    this.alpha = 1; this.fadeTo = 1;
    this.vstate = agent.state; this.prevVState = null; this.vstateAt = performance.now();
    this.shirtFrom = STATES[agent.state].color;
    this.phase = Math.floor(Math.random() * 5000);
    this.nextBlink = performance.now() + 1500 + Math.random() * 3000;
    this.spotSince = 0;
    this.fx = { spark: 0, glyph: 0, zzz: 0, steam: 0, throwCycle: -1 };
    this.receivedAt = -1e9;
    this.seatedOnce = false;
    this.paceDir = 1;
  }

  get state() { return this.vstate; }

  // ------------------------------------------------------------ движение
  goTo(loc, points) {
    this.loc = loc;
    this.path = points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    this.mode = this.path.length ? 'walk' : this.arriveMode(loc);
    if (!this.path.length) this.onArrive();
  }
  arriveMode(loc) { return loc.type === 'seat' ? 'seated' : loc.type === 'pace' ? 'pace' : 'idleSpot'; }
  onArrive() {
    this.mode = this.arriveMode(this.loc);
    this.spotSince = performance.now();
    if (this.loc.type === 'seat') {
      if (!this.seatedOnce) { this.seatedOnce = true; this.office.onSeated(this); }
    }
    if (this.loc.type === 'door' && this.loc.exit) { this.fadeTo = 0; }
    if (this.loc.type === 'visit') { this.face = 'side'; this.flip = false; } // гледа към детето
    if (this.loc.type === 'darts' || this.loc.type === 'board') this.flip = false;
    // на дивана: работещ без бюро – с лаптоп; почиващ – най-често игра на конзолката, понякога дрямка
    // „Фокус“: почиващите само седят (без конзолка и дрямка)
    if (this.loc.type === 'sofa') this.sofaAct = !this.seat && this.agent.state !== 'idle' ? 'laptop' : prefs.focus ? 'rest' : Math.random() < 0.7 ? 'game' : 'doze';
    if (this.pendingLoc) { const l = this.pendingLoc; this.pendingLoc = null; this.office.route(this, l); }
  }

  step(dt) {
    let left = CFG.WALK_SPEED * (this.loc.type === 'board' ? 1.8 : 1) * dt; // към екрана бърза – чакат го
    while (left > 0 && this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.01) { this.path.shift(); continue; }
      if (Math.abs(dx) > Math.abs(dy)) { this.face = 'side'; this.flip = dx < 0; }
      else this.face = dy > 0 ? 'front' : 'back';
      const m = Math.min(d, left);
      this.x += (dx / d) * m; this.y += (dy / d) * m;
      this.walkDist += m; left -= m;
      if (m >= d) this.path.shift();
    }
    if (!this.path.length) this.onArrive();
  }

  // ------------------------------------------------------------ кадър
  update(dt, now) {
    const a = this.agent;
    // визуално състояние
    if (a.state !== this.vstate) {
      this.prevVState = this.vstate;
      this.shirtFrom = this.shirtColor(now);
      this.vstate = a.state; this.vstateAt = now;
    }
    if (now > this.nextBlink + 130) this.nextBlink = now + 2200 + Math.random() * 3800;
    // прозрачност (появяване/изчезване)
    const fs = dt * 2.2;
    this.alpha = this.fadeTo > this.alpha ? Math.min(this.fadeTo, this.alpha + fs) : Math.max(this.fadeTo, this.alpha - fs);
    if (this.fadeTo === 0 && this.alpha === 0) this.mode = 'gone';
    if (this.mode === 'walk') this.step(dt);
    else if (this.mode === 'pace') this.paceStep(dt, now);
  }

  paceStep(dt, now) {
    const base = this.loc.x0;
    if (now - this.spotSince < 900) return; // пауза – "мисли"
    const target = base + this.paceDir * 12;
    const dx = target - this.x;
    const m = Math.min(Math.abs(dx), CFG.WALK_SPEED * 0.6 * dt);
    this.x += Math.sign(dx) * m; this.walkDist += m;
    this.face = 'side'; this.flip = dx < 0;
    if (Math.abs(target - this.x) < 0.3) { this.paceDir *= -1; this.spotSince = now; }
  }

  shirtColor(now) {
    const to = STATES[this.vstate].color;
    const k = clamp((now - this.vstateAt) / CFG.CROSSFADE_MS, 0, 1);
    if (k >= 1) return to;
    return mix(this.shirtFrom, to, Math.round(k * 6) / 6); // квантувано -> кешът остава малък
  }

  setLook(look) { this.look = look; this.sprites = new CharacterSprites(look); }

  /** Коя поза да се рисува сега. */
  pose(now) {
    const lt = now - this.vstateAt;
    const t = now + this.phase;
    if (this.mode === 'walk' || (this.mode === 'pace' && now - this.spotSince >= 900)) {
      const f = Math.floor(this.walkDist / 3.2) % 4;
      if (this.face === 'side') return (this.loc.carry ? 'carryS' : 'walkS') + f;
      return (this.face === 'back' ? 'walkB' : 'walkF') + f;
    }
    if (this.mode === 'pace') return 'standThink';
    if (this.mode === 'idleSpot') {
      const st = now - this.spotSince;
      if (this.loc.type === 'coffee' || this.loc.type === 'cooler') {
        if (st < 2600) return 'standBackUse';
        return frameAt(st, 1400) ? 'standSip' : 'standMug';
      }
      if (this.loc.type === 'sofa') {
        if (this.sofaAct === 'rest') return 'couchSit';
        if (this.sofaAct === 'laptop') return st < 900 ? 'couchSit' : frameAt(st + this.phase, 900) ? 'couchLaptopB' : 'couchLaptopA';
        if (this.sofaAct === 'game') return st < 1800 ? 'couchSit' : frameAt(st + this.phase, 420) ? 'couchGameB' : 'couchGameA';
        return st > 5000 ? 'couchDoze' : (frameAt(st, 2600) ? 'couchSit' : 'couchSip');
      }
      if (this.loc.type === 'darts') return dartPose(st);
      if (this.loc.type === 'board') return now - (this.boardPress || 0) < 650 ? 'standBackUse' : 'standBack'; // с дистанционното към екрана
      if (this.loc.type === 'door') return 'stand';
      if (this.loc.type === 'visit') return 'carryS1';
      // без бюро, но работи – прав с лаптоп
      if (!this.seat && this.agent.state !== 'idle' && this.loc.type === 'lounge') return frameAt(st + this.phase, 900) ? 'standLaptopB' : 'standLaptopA';
      return 'stand';
    }
    if (now - this.receivedAt < 1300) return 'readA'; // получи бележка от родителя
    return seatedPose(this.vstate, lt, t, this);
  }

  eyes(now, pose) {
    if (pose === 'doze' || pose === 'sip' || pose === 'couchDoze' || pose === 'couchSip' || pose === 'standBack' || pose === 'dartAim' || pose === 'dartThrow' || pose === 'stretch' || pose === 'standSip') return null;
    return now >= this.nextBlink && now < this.nextBlink + 130 ? 'closed' : null;
  }

  /** Дълбочина за сортиране. */
  depth(L) {
    if (this.pod >= 0) {
      const p = L.pods[this.pod];
      if (p && Math.abs(this.x - p.cx) < 1 && this.y > p.aisleY + 0.5 && this.y <= p.seatY + 0.5) return p.y + 24; // в стола
    }
    // седнал на дивана: пред седалката (sofa_front е с ключ base + 1), иначе тя скрива краката
    if (this.loc.type === 'sofa' && this.mode !== 'walk' && L.lounge) return L.lounge.sofa.base + 2;
    return this.y;
  }
  isAtDesk(L) {
    const p = L.pods[this.pod];
    return p && this.mode === 'seated' && Math.abs(this.x - p.cx) < 1 && Math.abs(this.y - p.seatY) < 1;
  }

  draw(ctx, now, layer) {
    if (this.alpha <= 0) return;
    const pose = this.pose(now);
    const f = this.sprites.frame(pose, this.eyes(now, pose), this.shirtColor(now));
    const img = layer === 'front' ? f.front : f.body;
    const x = Math.round(this.x) - 12, y = Math.round(this.y) - (FH - 1);
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;
    if (this.flip) {
      ctx.save(); ctx.translate(x + FW, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0); ctx.restore();
    } else ctx.drawImage(img, x, y);
    if (this.alpha < 1) ctx.globalAlpha = 1;
  }

  drawShadow(ctx) {
    if (this.alpha <= 0 || this.mode === 'seated') return;
    const x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = `rgba(16,10,24,${0.3 * this.alpha})`;
    ctx.fillRect(x - 5, y, 11, 2); ctx.fillRect(x - 4, y - 1, 9, 1);
  }

  /** Икони над главата (рисуват се над нощния оттенък, за да светят). */
  drawOverlay(ctx, now, partsFx) {
    if (this.alpha < 0.6) return;
    const hx = Math.round(this.x), hy = Math.round(this.y) - 31;
    const st = this.vstate;
    if (st === 'thinking' && this.mode !== 'walk') {
      const bx = hx + 6, by = hy - 12;
      R(ctx, '#f4f1e8', hx + 4, hy + 1, 1, 1);
      R(ctx, '#f4f1e8', hx + 6, hy - 2, 2, 2);
      // облаче
      R(ctx, '#2a2030', bx + 1, by - 1, 15, 11); R(ctx, '#2a2030', bx, by, 17, 9);
      R(ctx, '#f4f1e8', bx + 1, by, 15, 9); R(ctx, '#f4f1e8', bx + 2, by - 1 + 1, 13, 1);
      R(ctx, '#dcd6c6', bx + 1, by + 8, 15, 1);
      // двоичен поток: редове 0/1 (3x5), които се превъртат нагоре по 1 пиксел
      const sc = Math.floor((now + this.phase) / 120), off = sc % 6, row0 = Math.floor(sc / 6);
      ctx.save();
      ctx.beginPath(); ctx.rect(bx + 1, by, 15, 8); ctx.clip();
      for (let j = 0; j < 3; j++) {
        const r = row0 + j;
        for (let i = 0; i < 4; i++) {
          const h = (Math.imul(r * 4 + i, 2654435761) + (this.phase | 0)) >>> 0;
          drawText(ctx, (h >>> 7) & 1 ? '1' : '0', bx + 1 + i * 4, by + 1 + j * 6 - off, (h >>> 11) % 4 ? '#8a7a30' : '#e0c24a');
        }
      }
      ctx.restore();
    }
    if (st === 'waiting') {
      const bob = Math.round(Math.sin(now / 140) * 1.5);
      const pulse = frameAt(now, 320) === 0;
      const bx = hx - 5, by = hy - 16 + bob;
      R(ctx, '#2a0a14', bx - 1, by - 1, 12, 14);
      R(ctx, pulse ? '#ff5a7a' : '#e04a6b', bx, by, 10, 12);
      R(ctx, '#ffffff', bx + 1, by, 8, 1);
      R(ctx, '#2a0a14', bx + 4, by + 13, 3, 1); R(ctx, '#2a0a14', bx + 5, by + 14, 1, 1);
      R(ctx, pulse ? '#ff5a7a' : '#e04a6b', bx + 4, by + 12, 3, 1);
      drawText(ctx, '!', bx + 4, by + 1, '#ffffff', 2);
    }
    void partsFx;
  }
}

// ======================================================================
// Любимци – просто разнообразие в зоната за почивка (котки и куче)
// ======================================================================
class Pet {
  /** look = предмет от catalog.js; start = коя част от зоната (0..1) – за да не се появят една върху друга. */
  constructor(look, start = 0.5) { this.look = look; this.start = start; this.x = 0; this.y = 0; this.tx = 0; this.ty = 0; this.mode = 'sit'; this.until = 0; this.flip = false; this.dist = 0; this.placed = false; }
  get speed() { return 14; }
  /** Накъде да тръгне (people = хората в зоната за почивка – кучето понякога отива при тях). */
  target(area) { return { x: area.x0 + Math.random() * (area.x1 - area.x0), y: area.y0 + Math.random() * (area.y1 - area.y0) }; }
  rest() { return Math.random() < 0.35 ? 'sleep' : 'sit'; }
  update(dt, now, L, people = []) {
    const lo = L.lounge;
    const area = { x0: lo.x + 10, x1: lo.x + lo.w - 12, y0: lo.rug.y + 16, y1: L.H - 6 };
    if (!this.placed) { this.x = area.x0 + (area.x1 - area.x0) * this.start; this.y = area.y1 - 4; this.placed = true; this.until = now + 4000; }
    this.x = clamp(this.x, area.x0, area.x1); this.y = clamp(this.y, area.y0, area.y1);
    if (this.mode === 'walk') {
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
      if (d < 0.5) { this.mode = this.rest(); this.until = now + 6000 + Math.random() * 14000; return; }
      const m = Math.min(d, this.speed * dt);
      this.x += dx / d * m; this.y += dy / d * m; this.dist += m;
      if (Math.abs(dx) > 0.2) this.flip = dx < 0;
    } else if (now > this.until) {
      this.mode = 'walk';
      const t = this.target(area, people);
      this.tx = clamp(t.x, area.x0, area.x1); this.ty = clamp(t.y, area.y0, area.y1);
    }
  }
  /** Погален: сяда за малко (кучето маха по-бързо с опашка). */
  pet(now) { this.mode = 'sit'; this.until = now + 4500; this.pettedAt = now; }
  /** Попадение с мишката (логически пиксели) – за името при посочване. */
  hit(x, y) { return x >= this.x - 8 && x <= this.x + 8 && y >= this.y - 14 && y <= this.y + 2; }
}

export class Cat extends Pet {
  constructor(look = { c: '#3a3440', hi: '#5a5262', eye: '#e0c24a' }, start = 0.5) { super(look, start); this.kind = 'cat'; }
  draw(ctx, now) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const { c: C, hi: H, eye: E } = this.look;
    ctx.save();
    if (this.flip) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); }
    R(ctx, 'rgba(16,10,24,0.3)', x - 5, y, 11, 1);
    if (this.mode === 'sleep') {
      R(ctx, C, x - 5, y - 4, 10, 4); R(ctx, H, x - 4, y - 4, 7, 1); R(ctx, C, x + 3, y - 6, 4, 4);
      R(ctx, C, x + 3, y - 7, 1, 1); R(ctx, C, x + 6, y - 7, 1, 1); R(ctx, C, x - 6, y - 2, 2, 2);
    } else if (this.mode === 'sit') {
      R(ctx, C, x - 3, y - 6, 6, 6); R(ctx, H, x - 2, y - 6, 3, 1); R(ctx, C, x, y - 10, 5, 4);
      R(ctx, C, x, y - 11, 1, 1); R(ctx, C, x + 4, y - 11, 1, 1);
      R(ctx, frameAt(now, 3000, 12) === 0 ? C : E, x + 1, y - 9, 1, 1); R(ctx, frameAt(now, 3000, 12) === 0 ? C : E, x + 3, y - 9, 1, 1);
      const tw = frameAt(now, 600) ? 1 : 0;
      R(ctx, C, x - 5, y - 2 - tw, 2, 1); R(ctx, C, x - 6, y - 3 - tw, 1, 2);
    } else {
      const f = Math.floor(this.dist / 2) % 2;
      R(ctx, C, x - 5, y - 6, 9, 4); R(ctx, H, x - 4, y - 6, 7, 1);
      R(ctx, C, x + 3, y - 8, 4, 4); R(ctx, C, x + 3, y - 9, 1, 1); R(ctx, C, x + 6, y - 9, 1, 1);
      R(ctx, E, x + 5, y - 7, 1, 1);
      R(ctx, C, x - 4 + f, y - 2, 1, 2); R(ctx, C, x - 1 - f, y - 2, 1, 2); R(ctx, C, x + 1 + f, y - 2, 1, 2); R(ctx, C, x + 3 - f, y - 2, 1, 2);
      R(ctx, C, x - 7, y - 8, 2, 1); R(ctx, C, x - 6, y - 7, 1, 1);
    }
    if (this.look.pat) catPattern(ctx, this.look, this.mode, x, y, now, Math.floor(this.dist / 2) % 2);
    ctx.restore();
  }
}

// ======================================================================
// Куче: малко по-голямо от котката, тича по-бързо, сяда по-често, маха с опашка
// и понякога отива при някого на дивана / до кафемашината. Породата = предмет от catalog.js.
// ======================================================================
const NOSE = '#1a1214';
export class Dog extends Pet {
  constructor(look, start = 0.5) { super(look, start); this.kind = 'dog'; }
  get speed() { return 16; }
  rest() { return Math.random() < 0.25 ? 'sleep' : 'sit'; }
  target(area, people) {
    // 40%: при човек от зоната за почивка (застава до него, малко по-ниско)
    if (people.length && Math.random() < 0.4) {
      const p = people[Math.floor(Math.random() * people.length)];
      return { x: p.x + (Math.random() < 0.5 ? -12 : 12), y: p.y + 4 };
    }
    return super.target(area);
  }
  draw(ctx, now) {
    const x = Math.round(this.x), y = Math.round(this.y), lk = this.look;
    const { c: C, hi: H, m: M, e: E, eye: EY } = lk;
    const legC = lk.pat === 'saddle' || lk.pat === 'chest' ? M : C;
    const short = lk.legs === 'short', len = lk.len || 0;
    ctx.save();
    if (this.flip) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); }
    R(ctx, 'rgba(16,10,24,0.3)', x - 7 - Math.max(0, len), y, 15 + Math.max(0, len), 1);
    if (this.mode === 'sleep') {
      // легнал, муцуната на лапите
      const b0 = x - 6 - len;
      R(ctx, C, b0, y - 4, 11 + len, 4); R(ctx, H, b0 + 1, y - 4, 9 + len, 1);
      R(ctx, C, x + 4, y - 5, 5, 3); R(ctx, M, x + 9, y - 4, 2, 2); R(ctx, NOSE, x + 10, y - 4, 1, 1);
      R(ctx, E, x + 6, y - 4, 2, 1);                                  // затворено око
      R(ctx, legC, x + 5, y - 1, 5, 1);                               // предните лапи
      if (lk.ears === 'up') { R(ctx, E, x + 4, y - 7, 1, 2); R(ctx, E, x + 6, y - 7, 1, 2); } else R(ctx, E, x + 4, y - 5, 2, 3);
      if (lk.tail === 'curl') R(ctx, C, b0 - 1, y - 5, 2, 2); else if (lk.tail === 'stub') R(ctx, C, b0 - 1, y - 3, 1, 1); else R(ctx, C, b0 - 2, y - 2, 2, 1);
      dogPattern(ctx, lk, 'sleep', x, y, b0, 11 + len, y - 4);
    } else if (this.mode === 'sit') {
      // седнал изправен, гледа надясно; опашката маха по пода
      const s = short ? 2 : 0, tw = frameAt(now, now - (this.pettedAt || -1e9) < 4500 ? 90 : 220) ? 1 : 0;
      R(ctx, C, x - 4, y - 5 + s, 5, 5 - s);                          // задница
      R(ctx, C, x, y - 9 + s, 4, 9 - s); R(ctx, H, x + 1, y - 9 + s, 2, 1); // гърди
      R(ctx, legC, x + 2, y - 4 + s, 1, 4 - s); R(ctx, legC, x + 4, y - 3 + s, 1, 3 - s); // предни крака
      R(ctx, legC, x - 3, y - 1, 3, 1);                               // задна лапа
      const hy = y - 13 + s;
      R(ctx, C, x + 1, hy, 5, 4); R(ctx, H, x + 2, hy, 3, 1);
      R(ctx, M, x + 6, hy + 2, 2, 2); R(ctx, NOSE, x + 7, hy + 2, 1, 1);
      R(ctx, frameAt(now, 3200, 14) === 0 ? C : EY, x + 4, hy + 1, 1, 1);
      if (lk.ears === 'up') { R(ctx, E, x + 1, hy - 2, 1, 2); R(ctx, E, x + 3, hy - 2, 1, 2); } else R(ctx, E, x + 1, hy, 2, 3);
      if (lk.tail === 'curl') R(ctx, C, x - 5, y - 7 + s, 2, 2);
      else if (lk.tail === 'stub') R(ctx, C, x - 5, y - 3, 1, 1);
      else { R(ctx, C, x - 6, y - 1 - tw, 2, 1); R(ctx, C, x - 7, y - 2 - tw, 1, 1); }
      dogPattern(ctx, lk, 'sit', x, y, x, 4, hy);
    } else {
      // върви: тяло, 4 крака, глава напред
      const lg = short ? 2 : 3, bt = y - lg - 4, b0 = x - 5 - len, bw = 9 + len, f = Math.floor(this.dist / 2) % 2;
      R(ctx, C, b0, bt, bw, 4); R(ctx, H, b0 + 1, bt, bw - 2, 1);
      // крачка: във втория кадър лапите се разтварят (задните назад, предните напред)
      [b0 + 1, b0 + 3, x + 1, x + 3].forEach((lx, i) => {
        R(ctx, legC, lx, y - lg, 1, lg - 1);
        R(ctx, legC, lx + (f ? (i < 2 ? -1 : 1) * (i % 2 ? 1 : 0) : 0), y - 1, 1, 1);
      });
      R(ctx, C, x + 3, bt - 3, 5, 4); R(ctx, H, x + 4, bt - 3, 3, 1);
      R(ctx, M, x + 8, bt - 1, 2, 2); R(ctx, NOSE, x + 9, bt - 1, 1, 1);
      R(ctx, EY, x + 6, bt - 2, 1, 1);
      if (lk.ears === 'up') { R(ctx, E, x + 3, bt - 5, 1, 2); R(ctx, E, x + 5, bt - 5, 1, 2); } else R(ctx, E, x + 3, bt - 3, 2, 3);
      const wag = frameAt(now, 180);
      if (lk.tail === 'curl') { R(ctx, C, b0 - 1, bt - 2, 2, 2); R(ctx, H, b0, bt - 2, 1, 1); }
      else if (lk.tail === 'stub') R(ctx, C, b0 - 1, bt, 1, 1);
      else { R(ctx, C, b0 - 1, bt, 1, 1); R(ctx, C, b0 - 2, bt - 1 - wag, 1, 1 + wag); }
      dogPattern(ctx, lk, 'walk', x, y, b0, bw, bt);
    }
    ctx.restore();
  }
}

/** Шарки на кучетата (p = цвят). b0/bw/top = началото, ширината и горният ред на тялото (за седнал: x, 4, редът на главата). */
function dogPattern(ctx, lk, mode, x, y, b0, bw, top) {
  const P = lk.p;
  switch (lk.pat) {
    case 'saddle': // бигъл: черно седло, бял връх на опашката
      if (mode === 'walk') { R(ctx, P, b0 + 2, top, bw - 4, 2); R(ctx, lk.m, b0 - 2, top - 1, 1, 1); }
      else if (mode === 'sleep') R(ctx, P, b0 + 2, top, bw - 5, 2);
      else R(ctx, P, x - 3, y - 5, 3, 2);
      break;
    case 'chest': // корги: бели гърди и муцуна
      if (mode === 'walk') R(ctx, P, x + 1, top + 2, 3, 2);
      else if (mode === 'sleep') R(ctx, P, x + 1, top + 2, 3, 2);
      else { R(ctx, P, x + 2, top + 5, 2, 4); R(ctx, P, x + 5, top + 3, 1, 1); }
      break;
    case 'mask': // хъски: бяло лице и корем
      if (mode === 'walk') { R(ctx, P, x + 5, top - 1, 3, 2); R(ctx, P, b0 + 1, top + 3, bw - 2, 1); }
      else if (mode === 'sleep') { R(ctx, P, x + 6, top - 0, 3, 2); R(ctx, P, b0 + 1, top + 3, bw - 2, 1); }
      else { R(ctx, P, x + 3, top + 2, 3, 2); R(ctx, P, x + 1, top + 5, 3, 4); }
      break;
    case 'spots': { // далматинец: черни точки
      const pts = mode === 'walk' ? [[2, 1], [5, 0], [7, 2], [3, 3]] : mode === 'sleep' ? [[2, 1], [5, 0], [8, 2], [4, 3]] : [];
      for (const [i, j] of pts) R(ctx, P, b0 + i, top + j, 1, 1);
      if (mode === 'sit') { R(ctx, P, x - 3, y - 4, 1, 1); R(ctx, P, x + 1, y - 7, 1, 1); R(ctx, P, x + 3, y - 5, 1, 1); R(ctx, P, x + 2, top + 1, 1, 1); }
      break;
    }
  }
}

// шарки на котките (pat от catalog.js; p/p2 = цветовете на петната). Координатите са като в Cat.draw (гледа надясно).
function mottle(ctx, x0, y0, w, h, a, b) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = ((x0 + i) * 7 + (y0 + j) * 3) & 7;
    if (k === 0 || k === 5) R(ctx, a, x0 + i, y0 + j, 1, 1); else if (k === 2 && b) R(ctx, b, x0 + i, y0 + j, 1, 1);
  }
}
function catPattern(ctx, lk, mode, x, y, now, f) {
  const P = lk.p, P2 = lk.p2;
  const tw = mode === 'sit' && frameAt(now, 600) ? 1 : 0;
  switch (lk.pat) {
    case 'tabby':
      if (mode === 'sit') { R(ctx, P, x - 3, y - 4, 6, 1); R(ctx, P, x - 3, y - 2, 5, 1); R(ctx, P, x + 2, y - 10, 1, 1); R(ctx, P, x - 6, y - 3 - tw, 1, 1); }
      else if (mode === 'sleep') { for (const sx of [-4, -1, 2]) R(ctx, P, x + sx, y - 4, 1, 3); R(ctx, P, x + 4, y - 6, 1, 1); }
      else { for (const sx of [-4, -1, 2]) R(ctx, P, x + sx, y - 6, 1, 3); R(ctx, P, x + 4, y - 8, 1, 1); R(ctx, P, x - 7, y - 8, 1, 1); }
      break;
    case 'tuxedo':
      if (mode === 'sit') { R(ctx, P, x + 1, y - 6, 2, 4); R(ctx, P, x, y - 1, 1, 1); R(ctx, P, x + 2, y - 1, 1, 1); R(ctx, P, x + 3, y - 8, 2, 1); }
      else if (mode === 'sleep') { R(ctx, P, x + 5, y - 4, 2, 1); R(ctx, P, x + 2, y - 2, 2, 2); }
      else { R(ctx, P, x + 2, y - 4, 2, 2); R(ctx, P, x + 5, y - 6, 2, 1); for (const lx of [-4 + f, -1 - f, 1 + f, 3 - f]) R(ctx, P, x + lx, y - 1, 1, 1); }
      break;
    case 'siamese':
      if (mode === 'sit') { R(ctx, P, x + 2, y - 9, 1, 1); R(ctx, P, x + 1, y - 8, 3, 1); R(ctx, P, x + 2, y - 7, 1, 1); R(ctx, P, x, y - 11, 1, 1); R(ctx, P, x + 4, y - 11, 1, 1); R(ctx, P, x - 5, y - 2 - tw, 2, 1); R(ctx, P, x - 6, y - 3 - tw, 1, 2); R(ctx, P, x, y - 1, 1, 1); R(ctx, P, x + 2, y - 1, 1, 1); }
      else if (mode === 'sleep') { R(ctx, P, x + 5, y - 5, 2, 2); R(ctx, P, x + 3, y - 7, 1, 1); R(ctx, P, x + 6, y - 7, 1, 1); R(ctx, P, x - 6, y - 2, 2, 2); }
      else { R(ctx, P, x + 6, y - 7, 1, 2); R(ctx, P, x + 5, y - 6, 1, 1); R(ctx, P, x + 3, y - 9, 1, 1); R(ctx, P, x + 6, y - 9, 1, 1); R(ctx, P, x - 7, y - 8, 2, 1); R(ctx, P, x - 6, y - 7, 1, 1); }
      break;
    case 'calico':
      if (mode === 'sit') { R(ctx, P, x - 3, y - 6, 3, 2); R(ctx, P2, x, y - 3, 2, 2); R(ctx, P, x + 3, y - 10, 2, 1); R(ctx, P2, x + 4, y - 11, 1, 1); R(ctx, P, x - 6, y - 3 - tw, 1, 2); }
      else if (mode === 'sleep') { R(ctx, P, x - 5, y - 4, 3, 2); R(ctx, P2, x + 1, y - 3, 2, 2); R(ctx, P, x + 5, y - 6, 2, 1); }
      else { R(ctx, P, x - 5, y - 6, 3, 2); R(ctx, P2, x, y - 5, 2, 2); R(ctx, P, x + 5, y - 8, 2, 1); R(ctx, P2, x - 7, y - 8, 2, 1); }
      break;
    case 'tortie':
      if (mode === 'sit') { mottle(ctx, x - 3, y - 6, 6, 6, P, P2); mottle(ctx, x, y - 10, 5, 1, P, P2); }
      else if (mode === 'sleep') { mottle(ctx, x - 5, y - 4, 10, 4, P, P2); mottle(ctx, x + 3, y - 6, 4, 2, P, P2); }
      else { mottle(ctx, x - 5, y - 6, 9, 4, P, P2); mottle(ctx, x + 3, y - 8, 4, 1, P, P2); }
      break;
  }
}

export { rgba };
