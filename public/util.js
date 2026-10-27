// Дребни помощни функции: детерминиран random от низ, интерполации, рисуване на правоъгълници.

/** FNV-1a 32-bit хеш – един и същ id дава един и същ външен вид. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Малък бърз PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.range = (a0, b0) => a0 + next() * (b0 - a0);
  return next;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Правоъгълник с цвят – основната "четка" за процедурния арт. */
export function R(ctx, c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

/** Пикселна линия (Брезенхам) – за стрелките на часовника и пунктирите. */
export function pixLine(ctx, c, x0, y0, x1, y1, dash = 0, phase = 0) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, i = 0;
  ctx.fillStyle = c;
  for (;;) {
    if (!dash || ((i + phase) % (dash * 2)) < dash) ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    i++;
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

/** Съкращава път към файл "умно": запазва края (името на файла). */
export function shortDetail(s, max = 40) {
  if (!s) return '';
  s = String(s).trim();
  if (s.length <= max) return s;
  if (/[\\/]/.test(s) && !/\s/.test(s)) {
    const parts = s.split(/[\\/]/).filter(Boolean);
    let out = parts.pop();
    while (parts.length && out.length + parts[parts.length - 1].length + 2 <= max - 2) out = parts.pop() + '/' + out;
    return ('…/' + out).slice(-(max));
  }
  return s.slice(0, max - 1) + '…';
}

// Рискови команди – само за shell инструментите: трият рекурсивно, презаписват историята, пипат продукция.
// detail идва съкратен до 60 знака (brief() в server.js), затова шаблоните гледат само началото на командата.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'Shell']);
const DANGER = [
  /\brm\b(?=[^|;&]*\s-\w*r)(?=[^|;&]*\s-\w*f)/i,                    // rm -rf, rm -r -f, rm -fR
  /\bRemove-Item\b(?=[^|;]*\s-Recurse)(?=[^|;]*\s-Force)/i,        // Remove-Item -Recurse -Force
  /\b(?:rmdir|rd|del)\s+\/s\b/i,                                    // cmd: rmdir /s, del /s
  /\bgit\s+push\b[^|;&]*\s(?:--force|-f\b|--delete\b)/i,
  /\bgit\s+(?:reset\s+--hard|clean\s+-\w*f|branch\s+-D\b|filter-(?:branch|repo)\b)/,
  /\b(?:terraform|tofu|pulumi)\s+(?:apply|destroy|up)\b/i,
  /\bkubectl\s+(?:delete|apply|drain)\b|\bhelm\s+(?:uninstall|delete)\b/i,
  /\bdocker\s+(?:system\s+prune|volume\s+(?:rm|prune))\b/i,
  /\b(?:drop\s+(?:table|database|schema)|truncate\s+table)\b/i,
  /\b(?:npm|pnpm|yarn|cargo)\s+publish\b|\bgh\s+(?:repo|release)\s+delete\b/i,
  /\b(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b|\|\s*iex\b/i,
  /\bchmod\s+-R\s+777\b|\bmkfs\b|\bdd\s+if=|\bformat\s+[a-z]:/i,
  /\bprod(?:uction)?\b/i,                                           // всичко с „prod“ в командата
];
/** Рискова shell команда (⚠ в червено в балончето, картата, лентата и молбата за разрешение). */
export function danger(tool, detail) {
  return !!detail && SHELL_TOOLS.has(tool) && DANGER.some((re) => re.test(detail));
}

/** Приблизителна цена в $: „<$0.01“, „$3.42“, „$128“. */
export function fmtUsd(v) {
  if (!(v > 0)) return '$0';
  return v < 0.01 ? '<$0.01' : v < 100 ? '$' + v.toFixed(2) : '$' + Math.round(v).toLocaleString('en-US');
}

export function fmtDuration(ms, T) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} ${T.sec}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${T.min}`;
  return `${Math.floor(m / 60)} ${T.hour} ${m % 60} ${T.min}`;
}

/** Кратко име на модела: без датата накрая (claude-sonnet-4-5-20250514 -> claude-sonnet-4-5). */
export function shortModel(id) { return id ? id.replace(/-(\d{8})$/, '') : ''; }
