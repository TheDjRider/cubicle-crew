// Звуци: 8-битови тонове, синтезирани с WebAudio (без файлове). Свирят само когато нещо иска теб
// и само ако не гледаш прозореца (скрит / на заден план / друг прозорец е на фокус):
//   'ask'  – агент чака отговор или разрешение (дин-дон)
//   'done' – сесия приключи след поне минута работа (кратко арпеджио)
// Изключват се от звънчето в HUD (или от менюто в трея); изборът е в localStorage `po.sound`.
const KEY = 'po.sound';
const GAP_MS = 2500;        // между два звука изобщо
const SAME_MS = 10000;      // един и същ агент – не по-често от това
const QUIET_START_MS = 3000; // при зареждане вече чакащите не звънят

let ctx = null;
const lastBy = new Map();
let lastAny = 0;
const started = performance.now();

export function soundOn() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}
export function setSound(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* */ }
  if (on) { unlock(); play('ask', null, true); } // кратка проба – чуваш какво си включил
}

// браузърите пускат звук едва след първи клик/клавиш на страницата (Electron – веднага)
function audio() {
  // преди първия клик браузърът не позволява звук (и пише предупреждение) – не опитваме изобщо
  if (!ctx && !window.pixelOffice && navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function unlock() { audio(); }
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { once: true, capture: true });

// един тон: квадратна вълна с кратко затихване (звучи като стара конзола, но тихо)
function tone(ac, t, freq, dur, vol = 0.05, type = 'square') {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

const TUNES = {
  // дин-дон (E6 -> C6), с тих триъгълен "отблясък" за по-мек звук
  ask: (ac, t) => { tone(ac, t, 1318.5, 0.16); tone(ac, t, 2637, 0.12, 0.012, 'triangle'); tone(ac, t + 0.17, 1046.5, 0.32); tone(ac, t + 0.17, 2093, 0.25, 0.012, 'triangle'); },
  // готово: C5 E5 G5 C6
  done: (ac, t) => { [523.25, 659.25, 783.99].forEach((f, i) => tone(ac, t + i * 0.075, f, 0.09, 0.04)); tone(ac, t + 0.225, 1046.5, 0.38, 0.045); },
};

/** Не гледаш ли прозореца в момента? */
const away = () => document.hidden || !document.hasFocus();

/** Пуска звук `name` за агент `id`; force – без правилата (проба при включване). */
export function play(name, id, force = false) {
  if (!force) {
    const now = performance.now();
    if (!soundOn() || !away() || now - started < QUIET_START_MS || now - lastAny < GAP_MS) return false;
    if (id != null && now - (lastBy.get(id) ?? -1e9) < SAME_MS) return false;
    lastAny = now;
    if (id != null) lastBy.set(id, now);
  }
  const ac = audio();
  if (!ac || !TUNES[name]) return false;
  TUNES[name](ac, ac.currentTime + 0.02);
  lastUse = performance.now();
  return true;
}

// ================================================================ звуците на офиса (по желание)
// Всичко се синтезира тук (шум + осцилатори) – без файлове. Ключове в localStorage `po.audio`:
//   sfx     – отклик при клик по предметите в офиса (кафемашина, растение, аквариум…) – тихо, включено
//   ambient – фонов звук: клавиатурите на работещите, дъжд по стъклото, кафемашината, вратата… – изключено
//   lofi    – много тих синтезиран lofi фон (бавни акорди) – изключено
//   vol     – обща сила 0..1 за тези три (известията 'ask'/'done' не се пипат)
// Във „Фокус“ и в ?overlay мълчат. Контекстът се спира (suspend), щом нищо не звучи – процесорът не работи напразно.
const AKEY = 'po.audio';
const ADEF = { sfx: true, ambient: false, lofi: false, vol: 0.5 };
let A = { ...ADEF };
try { A = { ...ADEF, ...JSON.parse(localStorage.getItem(AKEY) || '{}') }; } catch { /* по подразбиране */ }
const aListeners = [];
const curve = (v) => v * v * 3; // по-плавно в тихия край (по подразбиране 0.5 -> 0.75)
export const audioPrefs = {
  get sfx() { return !!A.sfx; },
  get ambient() { return !!A.ambient; },
  get lofi() { return !!A.lofi; },
  get vol() { return Math.max(0, Math.min(1, Number(A.vol) || 0)); },
  set(k, v) {
    if (A[k] === v) return;
    A = { ...A, [k]: v };
    try { localStorage.setItem(AKEY, JSON.stringify(A)); } catch { /* */ }
    if (bus.master) bus.master.gain.setTargetAtTime(curve(audioPrefs.vol), bus.master.context.currentTime, 0.05);
    for (const fn of aListeners) fn(k, v);
  },
  onChange(fn) { aListeners.push(fn); },
};

// шини: master (силата) -> sfx / ambient
const bus = { master: null, sfx: null, amb: null };
let lastUse = 0;
/** Контекстът + шините (null преди първия клик в браузъра). */
export function audioOut() {
  const ac = audio();
  if (!ac) return null;
  if (!bus.master) {
    bus.master = ac.createGain(); bus.master.gain.value = curve(audioPrefs.vol); bus.master.connect(ac.destination);
    bus.sfx = ac.createGain(); bus.sfx.gain.value = 0.9; bus.sfx.connect(bus.master);
    bus.amb = ac.createGain(); bus.amb.gain.value = 0.7; bus.amb.connect(bus.master);
  }
  lastUse = performance.now();
  return { ac, sfx: bus.sfx, amb: bus.amb };
}
/** Нищо не звучи няколко секунди и фонът е спрян -> спира аудио нишката (без празна работа). */
export function audioIdle(busy) {
  if (busy) { lastUse = performance.now(); return; }
  if (ctx && ctx.state === 'running' && performance.now() - lastUse > 6000) ctx.suspend().catch(() => {});
}

let noiseBuf = null, brownBuf = null;
function noise(ac) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function brownNoise(ac) {
  if (brownBuf) return brownBuf;
  brownBuf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
  const d = brownBuf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < d.length; i++) { v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = v * 3.5; }
  return brownBuf;
}
export function noiseSource(ac, loop = false, brown = false) {
  const s = ac.createBufferSource(); s.buffer = brown ? brownNoise(ac) : noise(ac); s.loop = loop;
  return s;
}
// стерео според x в стаята (-1 ляво .. 1 дясно), леко – за усещане за място
function panner(ac, pan, out) {
  if (!pan || !ac.createStereoPanner) return out;
  const p = ac.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, pan)); p.connect(out);
  return p;
}
/** Изблик шум през филтър: щракване, шумолене, бълбукане, пара. */
export function burst(ac, out, t, { dur = 0.03, f = 3000, q = 1, type = 'bandpass', vol = 0.1, attack = 0.002, f2 = null, pan = 0 } = {}) {
  const s = noiseSource(ac), fl = ac.createBiquadFilter(), g = ac.createGain();
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  s.connect(fl).connect(g).connect(panner(ac, pan, out));
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
/** Тон с плъзгане (f -> f2): писукане, капка, мехур, птичка. */
export function blip(ac, out, t, f, dur, { vol = 0.06, type = 'sine', f2 = null, attack = 0.005, pan = 0 } = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(panner(ac, pan, out));
  o.start(t); o.stop(t + dur + 0.05);
}

// откликът на предметите (клик) и събитията във фона; всичко е кратко и тихо
const rr = (a, b) => a + Math.random() * (b - a);
export const SFX = {
  click: (ac, o, t, p) => { burst(ac, o, t, { dur: 0.025, f: 2400, q: 3, vol: 0.25, pan: p }); burst(ac, o, t + 0.05, { dur: 0.02, f: 1600, q: 3, vol: 0.12, pan: p }); },
  rustle: (ac, o, t, p) => { for (let i = 0; i < 7; i++) burst(ac, o, t + i * rr(0.04, 0.08), { dur: rr(0.05, 0.12), f: rr(3000, 6000), q: 0.8, vol: rr(0.05, 0.1), attack: 0.01, pan: p }); },
  brew: (ac, o, t, p) => {
    burst(ac, o, t, { dur: 0.9, f: 500, q: 0.7, type: 'lowpass', vol: 0.12, attack: 0.15, pan: p }); // помпата
    for (let i = 0; i < 9; i++) blip(ac, o, t + 0.3 + i * rr(0.09, 0.16), rr(300, 600), 0.06, { vol: 0.05, f2: rr(700, 1100), pan: p }); // бълбукане
    burst(ac, o, t + 1.3, { dur: 0.7, f: 6000, q: 0.5, type: 'highpass', vol: 0.05, attack: 0.1, pan: p }); // пара
    blip(ac, o, t + 2.1, 1760, 0.25, { vol: 0.04, type: 'triangle', pan: p }); // „дин“ – готово
  },
  glug: (ac, o, t, p) => { for (let i = 0; i < 4; i++) blip(ac, o, t + i * 0.16, rr(140, 220), 0.14, { vol: 0.12, f2: rr(380, 520), pan: p }); },
  tink: (ac, o, t, p) => { blip(ac, o, t, 2900, 0.18, { vol: 0.06, type: 'triangle', pan: p }); blip(ac, o, t + 0.12, 3100, 0.12, { vol: 0.035, type: 'triangle', pan: p }); for (let i = 0; i < 4; i++) blip(ac, o, t + 0.25 + i * 0.09, rr(500, 900), 0.05, { vol: 0.03, f2: rr(1200, 1800), pan: p }); },
  print: (ac, o, t, p) => {
    for (let i = 0; i < 10; i++) burst(ac, o, t + i * 0.11, { dur: 0.08, f: 900, q: 2, vol: 0.09, pan: p });
    blip(ac, o, t, 120, 1.15, { vol: 0.03, type: 'square', pan: p });
    burst(ac, o, t + 1.15, { dur: 0.25, f: 4000, q: 0.6, vol: 0.07, f2: 1500, pan: p }); // листът излиза
  },
  shred: (ac, o, t, p) => { burst(ac, o, t, { dur: 1.2, f: 220, q: 4, vol: 0.14, attack: 0.05, pan: p }); blip(ac, o, t, 70, 1.2, { vol: 0.05, type: 'sawtooth', pan: p }); },
  arcade: (ac, o, t, p) => { [523, 659, 784, 1046, 1318].forEach((f, i) => blip(ac, o, t + i * 0.06, f, 0.07, { vol: 0.035, type: 'square', pan: p })); blip(ac, o, t + 0.34, 1568, 0.2, { vol: 0.03, type: 'square', f2: 2093, pan: p }); },
  arcadeBg: (ac, o, t, p) => { const f = [392, 523, 659, 784][Math.floor(Math.random() * 4)]; blip(ac, o, t, f, 0.06, { vol: 0.015, type: 'square', pan: p }); blip(ac, o, t + 0.08, f * 1.5, 0.06, { vol: 0.012, type: 'square', pan: p }); },
  knock: (ac, o, t, p) => { for (let i = 0; i < 2; i++) { burst(ac, o, t + i * 0.16, { dur: 0.08, f: 260, q: 2, vol: 0.3, pan: p }); blip(ac, o, t + i * 0.16, 110, 0.07, { vol: 0.12, pan: p }); } },
  door: (ac, o, t, p) => { blip(ac, o, t, 340, 0.4, { vol: 0.012, type: 'sawtooth', f2: 520, attack: 0.1, pan: p }); burst(ac, o, t + 0.35, { dur: 0.08, f: 300, q: 1.5, vol: 0.06, pan: p }); },
  cuckoo: (ac, o, t, p) => { for (let i = 0; i < 2; i++) { blip(ac, o, t + i * 0.55, 784, 0.18, { vol: 0.05, type: 'triangle', pan: p }); blip(ac, o, t + i * 0.55 + 0.2, 622, 0.26, { vol: 0.05, type: 'triangle', pan: p }); } },
  thud: (ac, o, t, p) => { blip(ac, o, t, 95, 0.18, { vol: 0.18, f2: 55, pan: p }); burst(ac, o, t, { dur: 0.1, f: 600, q: 1, vol: 0.08, pan: p }); burst(ac, o, t + 0.12, { dur: 0.3, f: 5000, q: 0.5, vol: 0.03, type: 'highpass', attack: 0.05, pan: p }); },
  dart: (ac, o, t, p) => { burst(ac, o, t, { dur: 0.04, f: 1800, q: 2, vol: 0.12, pan: p }); blip(ac, o, t, 180, 0.05, { vol: 0.05, pan: p }); },
  poof: (ac, o, t, p) => { burst(ac, o, t, { dur: 0.35, f: 900, q: 0.6, type: 'lowpass', vol: 0.18, attack: 0.02, f2: 200, pan: p }); },
  squeak: (ac, o, t, p) => { blip(ac, o, t, 1400, 0.12, { vol: 0.05, type: 'triangle', f2: 2200, pan: p }); blip(ac, o, t + 0.13, 2000, 0.1, { vol: 0.04, type: 'triangle', f2: 1500, pan: p }); },
  splash: (ac, o, t, p) => { burst(ac, o, t, { dur: 0.3, f: 2500, q: 0.6, vol: 0.08, f2: 900, pan: p }); for (let i = 0; i < 3; i++) blip(ac, o, t + 0.05 + i * 0.07, rr(800, 1300), 0.05, { vol: 0.03, f2: rr(1800, 2600), pan: p }); },
  whirr: (ac, o, t, p) => { blip(ac, o, t, 90, 1.4, { vol: 0.05, type: 'sawtooth', f2: 140, attack: 0.2, pan: p }); burst(ac, o, t, { dur: 1.4, f: 400, q: 3, vol: 0.05, attack: 0.2, pan: p }); },
  jingle: (ac, o, t, p) => { [1568, 2093, 2637, 2093, 3136].forEach((f, i) => blip(ac, o, t + i * 0.07, f, 0.3, { vol: 0.025, type: 'triangle', pan: p })); },
  window: (ac, o, t, p) => { burst(ac, o, t, { dur: 0.22, f: 1200, q: 3, vol: 0.12, f2: 700, pan: p }); burst(ac, o, t + 0.2, { dur: 0.06, f: 500, q: 2, vol: 0.15, pan: p }); },
  page: (ac, o, t, p) => { for (let i = 0; i < 3; i++) burst(ac, o, t + i * 0.07, { dur: 0.09, f: rr(3500, 5500), q: 0.7, vol: 0.06, pan: p }); },
  purr: (ac, o, t, p) => { // мъркане: нисък шум, модулиран ~24 Hz
    const s = noiseSource(ac), fl = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    fl.type = 'lowpass'; fl.frequency.value = 180; lfo.frequency.value = 24; lg.gain.value = 0.06; lfo.connect(lg).connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 2.2);
    s.connect(fl).connect(g).connect(panner(ac, p, o)); s.start(t); s.stop(t + 2.3); lfo.start(t); lfo.stop(t + 2.3);
  },
  woof: (ac, o, t, p) => { blip(ac, o, t, 380, 0.12, { vol: 0.08, type: 'sawtooth', f2: 190, pan: p }); burst(ac, o, t, { dur: 0.12, f: 700, q: 1.5, vol: 0.08, pan: p }); },
  munch: (ac, o, t, p) => { for (let i = 0; i < 5; i++) burst(ac, o, t + i * 0.18, { dur: 0.05, f: rr(1200, 2200), q: 2, vol: 0.07, pan: p }); },
  bloop: (ac, o, t, p) => { blip(ac, o, t, 300, 0.12, { vol: 0.07, f2: 900, pan: p }); },
  key: (ac, o, t, p) => { burst(ac, o, t, { dur: rr(0.01, 0.02), f: rr(2200, 4200), q: 2, vol: rr(0.18, 0.32), pan: p }); },
  enter: (ac, o, t, p) => { burst(ac, o, t, { dur: 0.03, f: 1200, q: 2, vol: 0.12, pan: p }); blip(ac, o, t, 140, 0.04, { vol: 0.03, pan: p }); },
  drop: (ac, o, t, p) => { blip(ac, o, t, rr(1800, 3200), 0.03, { vol: rr(0.025, 0.05), f2: rr(900, 1400), pan: p }); },
  bird: (ac, o, t, p) => { const f = rr(2800, 4200); for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) blip(ac, o, t + i * 0.11, f, 0.08, { vol: 0.02, f2: f * rr(1.2, 1.5), pan: p }); },
  cricket: (ac, o, t, p) => { for (let i = 0; i < 3; i++) blip(ac, o, t + i * 0.05, 4400, 0.03, { vol: 0.01, type: 'triangle', pan: p }); },
  thunder: (ac, o, t, p) => { burst(ac, o, t, { dur: 2.6, f: 160, q: 0.7, type: 'lowpass', vol: 0.35, attack: 0.08, f2: 60, pan: p }); },
};

/** Отклик при клик по предмет (pan: -1..1 според мястото в стаята). quiet – „Фокус“ и подобни. */
export function sfx(name, pan = 0, quiet = false) {
  if (!audioPrefs.sfx || quiet || !SFX[name]) return false;
  const o = audioOut();
  if (!o) return false;
  SFX[name](o.ac, o.sfx, o.ac.currentTime + 0.01, pan);
  return true;
}
