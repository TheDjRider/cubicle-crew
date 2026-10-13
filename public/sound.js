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
  return true;
}
