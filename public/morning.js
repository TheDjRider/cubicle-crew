// Сутрешен екран: малкото прозорче при старт с Windows, докато няма нито една сесия.
// Аватарът пие кафе на бюрото, любимецът спи на перваза, небето в прозореца е по истинския час.
// Щом се появи агент (или потребителят кликне) – екранът изчезва и прозорецът става офисът.
import { T, STATES } from './config.js';
import { timeOfDay } from './environment.js';
import { applyWeather, drawWindowWeather } from './weather.js';
import { CharacterSprites, avatarLook, FW, FH } from './sprites.js';
import { Cat, Dog } from './characters.js';
import { ENV, mix, shade } from './palette.js';
import { drawText, textWidth } from './pixelfont.js';
import { R, rng } from './util.js';

// хореография на аватара за един цикъл (секунди): [до, поза]
const SCRIPT = [
  [4, 'sip'], [9, 'sit'], [11, 'stretch'], [15, 'chin'], [17.4, 'wave'], [19, 'sit'], [25, 'doze'], [26, 'sit'], [28.4, 'scratch'], [31, 'sit'],
];
const CYCLE = SCRIPT[SCRIPT.length - 1][0];
const FRAME_MS = 100;  // ~10 fps стигат за пикселна анимация, а прозорецът виси така с часове
const MIN_W = 120, MIN_H = 68;

export class Morning {
  constructor(office, onWake) {
    this.office = office; this.onWake = onWake;
    this.active = true; this.lastDraw = -1e9;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'morning';
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.box = document.createElement('div');
    this.box.id = 'wait';
    this.box.title = T.wait.hint;
    document.body.append(this.canvas, this.box);
    document.body.classList.add('waiting');
    this.canvas.addEventListener('click', () => this.wake());
    this.box.addEventListener('click', () => this.wake());
    this.pet = null; this.petKey = null;
    this.resize();
    addEventListener('resize', () => { if (this.active) this.resize(); });
  }

  /** Цяло число мащаб (физически пиксели), сцената запълва целия прозорец. */
  resize() {
    const dpr = window.devicePixelRatio || 1, dw = Math.round(innerWidth * dpr), dh = Math.round(innerHeight * dpr);
    this.scale = Math.max(1, Math.floor(Math.min(dw / MIN_W, dh / MIN_H)));
    this.W = Math.ceil(dw / this.scale); this.H = Math.ceil(dh / this.scale);
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.canvas.style.width = `${(this.W * this.scale) / dpr}px`;
    this.canvas.style.height = `${(this.H * this.scale) / dpr}px`;
    // сградите отвън – веднъж на размер
    const r = rng(7), b = [];
    for (let x = -2; x < this.W; x += 5 + r.int(6)) b.push({ x, w: 5 + r.int(6), h: 6 + r.int(14), lit: r.int(1000) });
    this.buildings = b;
    this.lastDraw = -1e9;
  }

  wake() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('waiting');
    this.canvas.classList.add('gone'); this.box.classList.add('gone');
    setTimeout(() => { this.canvas.remove(); this.box.remove(); }, 700);
    this.onWake?.();
  }

  /** Вика се всеки кадър; рисува само ~10 пъти в секунда. */
  render(now, date, weather = null) {
    if (!this.active || now - this.lastDraw < FRAME_MS) return;
    this.lastDraw = now;
    const ctx = this.ctx, W = this.W, H = this.H, tod = applyWeather(timeOfDay(date), weather);
    const floorY = H - 18, t = now / 1000;
    ctx.imageSmoothingEnabled = false;

    // ---- стена, ламперия, под
    R(ctx, ENV.ceiling, 0, 0, W, 3);
    R(ctx, ENV.wall, 0, 3, W, floorY - 3);
    for (let x = 6; x < W; x += 12) R(ctx, ENV.wallStripe, x, 3, 4, floorY - 13);
    R(ctx, ENV.wainscot, 0, floorY - 10, W, 10); R(ctx, ENV.wainscotHi, 0, floorY - 10, W, 1); R(ctx, ENV.rail, 0, floorY - 11, W, 1);
    R(ctx, ENV.base, 0, floorY - 2, W, 2);
    for (let y = floorY, i = 0; y < H; y += 4, i++) {
      R(ctx, ENV.floor[i % 4], 0, y, W, 4);
      for (let x = (i * 7) % 16; x < W; x += 16) R(ctx, ENV.floorSeam, x, y, 1, 4);
    }
    R(ctx, ENV.floorHi, 0, floorY, W, 1);

    // ---- прозорец с небето по истинския час
    const wx = 6, wy = 7, ww = Math.max(40, Math.round(W * 0.4)), wh = floorY - 22;
    this.drawSky(ctx, tod, wx, wy, ww, wh, t);
    R(ctx, ENV.frame, wx - 2, wy - 2, ww + 4, 2); R(ctx, ENV.frame, wx - 2, wy + wh, ww + 4, 2);
    R(ctx, ENV.frame, wx - 2, wy, 2, wh); R(ctx, ENV.frame, wx + ww, wy, 2, wh);
    R(ctx, ENV.frame, wx + (ww >> 1) - 1, wy, 2, wh); R(ctx, ENV.frame, wx, wy + (wh >> 1), ww, 1);
    R(ctx, ENV.frameDk, wx - 3, wy + wh + 2, ww + 6, 2); // перваз

    // ---- бюро вдясно, аватарът зад него
    const deskW = 62, dx = Math.min(W - deskW - 6, Math.max(wx + ww + 10, W - deskW - 10)), dTop = floorY - 15;
    const cx = dx + 37; // центърът на стола
    // часовник на стената над бюрото
    this.drawClock(ctx, dx + deskW - 9, 11, date);
    // стол (облегалката се вижда над рамото)
    R(ctx, ENV.chairDk, cx - 8, dTop - 17, 16, 14); R(ctx, ENV.chair, cx - 7, dTop - 16, 14, 12); R(ctx, ENV.chairHi, cx - 6, dTop - 16, 12, 2);
    // аватарът
    const pose = this.pose(t);
    const look = avatarLook(this.office.avatar, 'morning');
    if (!this.sprites || this.lookKey !== JSON.stringify(this.office.avatar)) { this.sprites = new CharacterSprites(look); this.lookKey = JSON.stringify(this.office.avatar); }
    const blink = pose.name === 'sit' && t % 3.7 < 0.15 ? 'closed' : null;
    const f = this.sprites.frame(pose.name, blink, STATES.idle.color);
    const px = cx - (FW >> 1), py = dTop + 6 - FH;
    ctx.drawImage(f.body, px, py);
    // бюрото
    R(ctx, ENV.deskTopHi, dx, dTop, deskW, 1); R(ctx, ENV.deskTop, dx, dTop + 1, deskW, 3); R(ctx, ENV.deskEdge, dx, dTop + 4, deskW, 1);
    R(ctx, ENV.deskFront, dx + 1, dTop + 5, deskW - 2, floorY - dTop - 4); R(ctx, ENV.deskFrontHi, dx + 1, dTop + 5, deskW - 2, 1);
    R(ctx, ENV.deskFrontDk, dx + 4, dTop + 8, 18, 1); R(ctx, ENV.deskFrontDk, dx + deskW - 22, dTop + 8, 18, 1);
    R(ctx, ENV.shadow, dx - 2, floorY + 1, deskW + 4, 2);
    ctx.drawImage(f.front, px, py);
    // монитор вляво на бюрото: часът (двоеточието мига)
    this.drawMonitor(ctx, dx + 2, dTop - 15, date, t);
    // чаша на бюрото, когато не е в ръката – с пара
    if (pose.name !== 'sip') this.drawMug(ctx, dx + deskW - 12, dTop - 4, t);
    else this.drawSteam(ctx, px + 13, py + 10, t);
    if (pose.name === 'doze') this.drawZ(ctx, px + 17, py + 4, t);
    // растение в ъгъла
    const plx = dx + deskW - 4;
    R(ctx, ENV.pot[1], plx - 1, dTop - 5, 5, 5); R(ctx, ENV.pot[0], plx - 1, dTop - 5, 5, 1);
    R(ctx, ENV.leaf[1], plx - 1, dTop - 9, 2, 4); R(ctx, ENV.leaf[0], plx + 1, dTop - 11, 2, 6); R(ctx, ENV.leaf[2], plx + 3, dTop - 8, 2, 3);

    // ---- първият любимец от офиса спи на перваза, понякога сяда и се оглежда
    const first = this.office.pets[0] || null, key = first ? first.look.id || first.kind : '';
    if (key !== this.petKey) { this.petKey = key; this.pet = first ? new (first.kind === 'dog' ? Dog : Cat)(first.look) : null; }
    const pet = this.pet;
    if (pet) {
      const cyc = t % 40;
      pet.mode = cyc > 30 && cyc < 36 ? 'sit' : 'sleep';
      pet.x = wx + (pet.kind === 'dog' ? 12 : 9); pet.y = wy + wh + 2; // подът е под надписа – и кучето е на перваза
      pet.flip = false;
      pet.draw(ctx, now);
      if (pet.mode === 'sleep') this.drawZ(ctx, pet.x + (pet.kind === 'dog' ? 9 : 6), pet.y - (pet.kind === 'dog' ? 8 : 11), t * 0.8, true);
    }

    // ---- светлина: нощем синкаво, на изгрев топло; мониторът свети
    if (tod.tint !== '#ffffff') {
      ctx.globalCompositeOperation = 'multiply';
      R(ctx, tod.tint, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (tod.night > 0.3) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(dx + 13, dTop - 8, 1, dx + 13, dTop - 8, 26);
      g.addColorStop(0, `rgba(80,140,120,${0.35 * tod.night})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(dx - 20, dTop - 34, 66, 52);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.updateText(date);
  }

  /** Текуща поза от сценария (махането и чесането сменят два кадъра). */
  pose(t) {
    const s = t % CYCLE;
    const p = SCRIPT.find(([until]) => s < until)[1];
    const alt = Math.floor(t / 0.32) % 2;
    if (p === 'wave') return { name: alt ? 'waveA' : 'waveB' };
    if (p === 'scratch') return { name: alt ? 'scratchA' : 'scratchB' };
    return { name: p };
  }

  drawSky(ctx, tod, x, y, w, h, t) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, tod.skyTop); g.addColorStop(1, tod.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    // звезди
    if (tod.night > 0.4) {
      const r = rng(3);
      for (let i = 0; i < w / 4; i++) {
        const sx = x + r.int(w), sy = y + r.int(Math.max(1, h - 12));
        if ((Math.floor(t * 0.7) + i) % 9) R(ctx, mix('#ffffff', tod.skyTop, 0.3), sx, sy, 1, 1);
      }
    }
    // слънце или луна по дъга
    const arc = (k) => [x + 4 + k * (w - 8), y + h - 6 - Math.sin(k * Math.PI) * (h - 12)];
    const cover = tod.cover || 0;
    if (tod.sun != null && cover < 0.7) {
      const [sx, sy] = arc(tod.sun);
      R(ctx, '#ffe9a0', Math.round(sx) - 2, Math.round(sy) - 3, 5, 7); R(ctx, '#ffe9a0', Math.round(sx) - 3, Math.round(sy) - 2, 7, 5);
      R(ctx, '#fff6d8', Math.round(sx) - 1, Math.round(sy) - 2, 3, 3);
    } else if (tod.moon != null && cover < 0.75) {
      const [mx, my] = arc(tod.moon);
      R(ctx, '#e8ecf8', Math.round(mx) - 2, Math.round(my) - 2, 5, 5); R(ctx, tod.skyTop, Math.round(mx), Math.round(my) - 2, 3, 3);
    }
    // облаци, бавно
    const cc = mix('#ffffff', tod.skyBottom, 0.25 + tod.night * 0.5);
    for (let i = 0; i < 3 + Math.round(cover * 4); i++) {
      const span = w + 30, cx = x - 15 + ((t * (1.2 + i * 0.5) + i * 37) % span), cy = y + 4 + i * 7;
      R(ctx, cc, Math.round(cx), cy, 12 - i * 2, 3); R(ctx, cc, Math.round(cx) + 3, cy - 2, 5, 2);
    }
    // сгради на хоризонта; нощем прозорците светят
    const base = y + h, dark = mix('#2a2840', tod.skyBottom, 0.25), lit = '#f0d070';
    for (const b of this.buildings) {
      if (b.x > x + w || b.x + b.w < x) continue;
      R(ctx, dark, b.x + x, base - b.h, b.w, b.h);
      if (tod.night > 0.35) for (let wy2 = base - b.h + 2; wy2 < base - 1; wy2 += 3) for (let wx2 = b.x + x + 1; wx2 < b.x + x + b.w - 1; wx2 += 2) {
        if ((b.lit + wx2 * 7 + wy2 * 13) % 5 === 0) R(ctx, lit, wx2, wy2, 1, 1);
      }
    }
    drawWindowWeather(ctx, { x, y, w, h }, tod.wx, tod, t * 1000);
    ctx.restore();
  }

  drawClock(ctx, x, y, date) {
    R(ctx, ENV.frameDk, x - 5, y - 4, 11, 9); R(ctx, ENV.frameDk, x - 4, y - 5, 9, 11);
    R(ctx, ENV.paper, x - 4, y - 3, 9, 7); R(ctx, ENV.paper, x - 3, y - 4, 7, 9);
    const hand = (ang, len, c) => {
      for (let i = 1; i <= len; i++) R(ctx, c, Math.round(x + Math.sin(ang) * i), Math.round(y - Math.cos(ang) * i), 1, 1);
    };
    const h = date.getHours() % 12 + date.getMinutes() / 60, m = date.getMinutes() + date.getSeconds() / 60;
    hand((m / 60) * Math.PI * 2, 3, '#3a3448');
    hand((h / 12) * Math.PI * 2, 2, '#c04a4a');
    R(ctx, '#3a3448', x, y, 1, 1);
  }

  drawMonitor(ctx, x, y, date, t) {
    const w = 22, h = 14;
    R(ctx, ENV.monitorDk, x, y, w, h); R(ctx, ENV.monitor, x + 1, y + 1, w - 2, h - 2);
    const scr = mix('#103a30', '#1a5a48', 0.5);
    R(ctx, scr, x + 2, y + 2, w - 4, h - 4);
    const hh = String(date.getHours()).padStart(2, '0'), mm = String(date.getMinutes()).padStart(2, '0');
    // ' ' е по-широк от ':' – затова часът, двоеточието и минутите се рисуват поотделно, на постоянни места
    const full = `${hh}:${mm}`, x0 = x + Math.round((w - textWidth(full)) / 2);
    drawText(ctx, hh, x0, y + 3, '#8af0b8');
    if (t % 1 < 0.5) drawText(ctx, ':', x0 + textWidth(`${hh}:`) - textWidth(':'), y + 3, '#8af0b8');
    drawText(ctx, mm, x0 + textWidth(full) - textWidth(mm), y + 3, '#8af0b8');
    R(ctx, ENV.monitorDk, x + 9, y + h, 4, 2); R(ctx, ENV.monitorHi, x + 6, y + h + 1, 10, 1);
  }

  drawMug(ctx, x, y, t) {
    const c = '#4a8fe0';
    R(ctx, c, x, y, 4, 4); R(ctx, shade(c, 0.72), x + 3, y, 1, 4); R(ctx, shade(c, 0.72), x + 4, y + 1, 1, 2);
    R(ctx, '#3a2418', x + 1, y, 2, 1);
    this.drawSteam(ctx, x + 1, y - 1, t);
  }

  drawSteam(ctx, x, y, t) {
    const c = 'rgba(240,240,250,0.6)';
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.9 + i / 3) % 1;
      R(ctx, c, x + Math.round(Math.sin((k + i) * 5) * 1), y - Math.round(k * 7), 1, 1);
    }
  }

  /** Малки "z" (4x4), които се издигат и избледняват. */
  drawZ(ctx, x, y, t, small = false) {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.5 + i / 2) % 1, zx = x + Math.round(k * 4), zy = y - Math.round(k * 8);
      const c = `rgba(232,228,246,${((small ? 0.6 : 0.9) * (1 - k)).toFixed(2)})`;
      R(ctx, c, zx, zy, 4, 1); R(ctx, c, zx + 2, zy + 1, 1, 1); R(ctx, c, zx + 1, zy + 2, 1, 1); R(ctx, c, zx, zy + 3, 4, 1);
    }
  }

  updateText(date) {
    const h = date.getHours();
    const hello = h >= 4 && h < 12 ? T.wait.morning : h >= 12 && h < 18 ? T.wait.day : T.wait.evening;
    const html = `<b>${hello}</b><span>${T.wait.msg}</span>`;
    if (this.box._html !== html) { this.box.innerHTML = html; this.box._html = html; }
  }
}
