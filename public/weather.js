// Времето навън в сцената. Данните идват от сървъра (Open-Meteo, само ако е зададен град) или от ?weather=...
// Тук: WMO код -> параметри за рисуване, по-сиво небе/по-тъмна стая (applyWeather), валежи/мъгла/светкавици
// по прозорците (drawWindowWeather) и табелката с температурата и вероятността за валежи (drawWeatherPlaque).
import { mix, rgba, shade } from './palette.js';
import { R } from './util.js';
import { drawText, textWidth } from './pixelfont.js';

const STALE_MS = 3 * 60 * 60 * 1000; // по-старо време не показваме (няма интернет от часове)

/** WMO код -> вид. */
export function kindOf(code) {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'overcast';
  if (code === 2 || code === 1) return code === 2 ? 'cloudy' : 'clear';
  return 'clear';
}
const RAIN = { 51: 0.25, 53: 0.35, 55: 0.45, 56: 0.3, 57: 0.45, 61: 0.45, 63: 0.7, 65: 1, 66: 0.5, 67: 0.9, 80: 0.5, 81: 0.75, 82: 1, 95: 0.85, 96: 0.9, 99: 1 };
const SNOW = { 71: 0.35, 73: 0.65, 75: 1, 77: 0.3, 85: 0.5, 86: 0.9 };

// ?weather=rain и т.н. – за тестове и демото (температурата и % са измислени)
export const FAKE = {
  clear: { code: 0, cloud: 5, temp: 23, pop: 0 },
  cloudy: { code: 2, cloud: 55, temp: 17, pop: 10 },
  overcast: { code: 3, cloud: 100, temp: 12, pop: 20 },
  fog: { code: 45, cloud: 100, temp: 7, pop: 10 },
  drizzle: { code: 53, cloud: 100, temp: 10, pop: 70 },
  rain: { code: 63, cloud: 100, temp: 11, pop: 90 },
  snow: { code: 73, cloud: 100, temp: -3, pop: 85 },
  storm: { code: 95, cloud: 100, temp: 19, pop: 95 },
};
export function fakeNow(name) { const f = FAKE[name]; return f ? { ...f, at: Date.now(), fake: true } : null; }

/** Сурово време от сървъра -> параметри за рисуване (null = няма/остаряло -> ясно небе като досега). */
export function wxFrom(now) {
  if (!now || (!now.fake && Date.now() - now.at > STALE_MS)) return null;
  const code = now.code | 0, kind = kindOf(code);
  let cover = Math.max(0, Math.min(1, (now.cloud ?? 0) / 100));
  if (kind !== 'clear' && kind !== 'cloudy') cover = Math.max(cover, 0.85);
  return {
    kind, code, cover,
    rain: RAIN[code] || 0,
    snow: SNOW[code] || 0,
    fog: kind === 'fog' ? 1 : 0,
    storm: kind === 'storm',
    temp: now.temp, pop: now.pop,
  };
}

/** Небето и стаята според времето: по-сиво небе, без слънчеви снопове при облачно, по-тъмна стая. */
export function applyWeather(tod, wx) {
  if (!wx) return tod;
  const grey = mix('#9aa2b4', '#1c1e2c', tod.night);
  const k = wx.cover * 0.7 + wx.fog * 0.2 + (wx.storm ? 0.1 : 0);
  const dark = tod.daylight * (wx.cover * 0.16 + wx.rain * 0.1 + wx.snow * 0.04 + wx.fog * 0.08 + (wx.storm ? 0.1 : 0));
  return {
    ...tod,
    skyTop: mix(tod.skyTop, shade(grey, 0.92), Math.min(0.9, k)),
    skyBottom: mix(tod.skyBottom, grey, Math.min(0.9, k)),
    tint: dark > 0.005 ? mix(tod.tint, '#8c92a8', dark * 2.2) : tod.tint,
    sunny: Math.max(0, 1 - wx.cover * 1.15),
    cover: wx.cover,
    wx,
  };
}

/** Светкавица: два бързи проблясъка на всеки ~9 s (детерминирано по времето). */
export function flashAt(wx, t) {
  if (!wx?.storm) return 0;
  const c = t % 9300;
  return c < 90 ? 1 : c > 230 && c < 300 ? 0.6 : 0;
}

// псевдослучайно 0..1 по индекс (стабилно между кадрите)
const hr = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/** Валежи, мъгла и светкавица в един прозорец (рисува се вътре в clip-а на стъклото, след силуета). */
export function drawWindowWeather(ctx, w, wx, tod, t) {
  if (!wx) return;
  const night = tod.night;
  if (wx.fog) {
    const fc = mix('#d8dce6', '#3a3e52', night);
    ctx.fillStyle = rgba(fc, 0.74); ctx.fillRect(w.x, w.y, w.w, w.h);
    for (let i = 0; i < 4; i++) {
      const y = w.y + Math.round(w.h * (0.2 + i * 0.2)), dx = Math.round(((t / 120) + i * 17) % (w.w + 20)) - 10;
      ctx.fillStyle = rgba(fc, 0.35); ctx.fillRect(w.x + dx - 8, y, 16, 2); ctx.fillRect(w.x + dx - 30, y + 1, 12, 1);
    }
  }
  if (wx.rain) {
    const n = Math.round(w.w * w.h / 34 * wx.rain), rc = rgba(mix('#c8d4ec', '#7080a8', night), 0.55 + wx.rain * 0.2);
    ctx.fillStyle = rc;
    const sp = 0.16 + wx.rain * 0.08;
    for (let i = 0; i < n; i++) {
      const s = w.x * 0.37 + i;
      const y = (hr(i, w.x) * w.h + t * sp * (0.8 + hr(i, 3) * 0.4)) % (w.h + 4) - 4;
      const x = (hr(i, w.x + 7) * (w.w + 8) - y * 0.25 + 400) % (w.w + 8) - 4;
      const len = wx.rain > 0.6 ? 3 : 2;
      for (let k = 0; k < len; k++) ctx.fillRect(Math.round(w.x + x - k * 0.25), Math.round(w.y + y + k), 1, 1);
      void s;
    }
    // капки по стъклото – бавно се стичат
    const dc = mix('#e8f0ff', '#8a98c0', night);
    for (let i = 0; i < 5; i++) {
      const x = w.x + 2 + Math.floor(hr(i, w.x + 1) * (w.w - 4));
      const y = w.y + ((hr(i, w.x + 2) * w.h + t / (900 + i * 300)) % w.h);
      ctx.fillStyle = rgba(dc, 0.55); ctx.fillRect(x, Math.round(y), 1, 2);
      ctx.fillStyle = rgba(dc, 0.2); ctx.fillRect(x, Math.round(y) - 3, 1, 3);
    }
  }
  if (wx.snow) {
    const n = Math.round(w.w * w.h / 60 * wx.snow), sc = mix('#ffffff', '#a8b0d0', night * 0.6);
    for (let i = 0; i < n; i++) {
      const y = (hr(i, w.x + 5) * w.h + t * 0.012 * (0.7 + hr(i, 9) * 0.6)) % (w.h + 2) - 1;
      const x = (hr(i, w.x + 11) * w.w + Math.sin(t / 900 + i) * 2 + w.w) % w.w;
      ctx.fillStyle = rgba(sc, 0.85);
      ctx.fillRect(Math.round(w.x + x), Math.round(w.y + y), hr(i, 4) < 0.2 ? 2 : 1, 1);
    }
    // сняг по външния праг
    R(ctx, sc, w.x, w.y + w.h - 2, w.w, 2); R(ctx, shade(sc, 0.85), w.x, w.y + w.h - 1, w.w, 1);
  }
  const f = flashAt(wx, t);
  if (f) { ctx.fillStyle = rgba('#f4f6ff', 0.55 * f); ctx.fillRect(w.x, w.y, w.w, w.h); }
}

// ---------------------------------------------------------------- табелка на стената
const ICON = {
  sun: ['1.1.1', '.111.', '11111', '.111.', '1.1.1'],
  moon: ['..11.', '.11..', '.1...', '.11..', '..11.'],
  cloud: ['.....', '.11..', '11111', '11111', '.....'],
  part: ['...1.', '.11.1', '11111', '11111', '.....'],
  rain: ['.11..', '11111', '11111', '.....', '1.1.1'],
  snow: ['.11..', '11111', '11111', '.....', '.1.1.'],
  storm: ['.11..', '11111', '11111', '..1..', '.1...'],
  fog: ['1111.', '.....', '.1111', '.....', '1111.'],
};
function icon(ctx, rows, x, y, c, c2) {
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') R(ctx, c2 && (j >= 3 || (rows === ICON.part && j === 0) || (rows === ICON.part && i === 4 && j === 1)) ? c2 : c, x + i, y + j, 1, 1); });
}
function iconFor(wx, tod) {
  switch (wx.kind) {
    case 'clear': return tod.night > 0.5 ? [ICON.moon, '#e8e4c8'] : [ICON.sun, '#f0c840'];
    case 'cloudy': return [ICON.part, '#c8ccd8', '#f0c840'];
    case 'overcast': return [ICON.cloud, '#a8aebe'];
    case 'fog': return [ICON.fog, '#a8aebe'];
    case 'snow': return [ICON.snow, '#a8aebe', '#ffffff'];
    case 'storm': return [ICON.storm, '#8890a4', '#f0d040'];
    default: return [ICON.rain, '#a8aebe', '#6aaaf0']; // rain, drizzle
  }
}

/** Ширина на табелката (за подреждане до тази с токените). */
export function plaqueWidth(wx) {
  if (!wx) return 0;
  const t = wx.temp == null ? '--°' : `${Math.round(wx.temp)}°`;
  return 2 + 5 + 3 + textWidth(t) + (wx.pop != null ? 4 + textWidth(`${Math.round(wx.pop)}%`) : 0) + 2;
}

/** Метеостанция: икона, температура, вероятност за валежи. */
export function drawWeatherPlaque(ctx, x, y, wx, tod) {
  const w = plaqueWidth(wx);
  if (!w) return null;
  R(ctx, '#1a1420', x, y, w, 9);
  R(ctx, '#2a3448', x + 1, y + 1, w - 2, 7);
  const [rows, c, c2] = iconFor(wx, tod);
  icon(ctx, rows, x + 2, y + 2, c, c2);
  const t = wx.temp == null ? '--°' : `${Math.round(wx.temp)}°`;
  let cx = x + 10;
  drawText(ctx, t, cx, y + 2, wx.temp != null && wx.temp <= 0 ? '#9ad0ff' : '#f4f0e6');
  cx += textWidth(t) + 4;
  if (wx.pop != null) drawText(ctx, `${Math.round(wx.pop)}%`, cx, y + 2, '#7ab8f0');
  return { x, y, w, h: 9 };
}
