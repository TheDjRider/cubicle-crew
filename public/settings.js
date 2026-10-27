// Настройки и помощ – панел в прозореца (менюто в трея остава кратко): колона с разделите вляво, съдържанието вдясно.
// Разделите са по смисъл: как изглежда, кога те вика, какво вижда/праща, прозорецът, споделяне, помощ.
// Всеки раздел има цвят от езика на състоянията и пикселна иконка 9x9 (рисува се тук, без файлове).
// Отметките носят същите data-* като досега – ui.onHelpChange() ги прилага.
import { T, LANG, STATES, STATE_ORDER } from './config.js';
import { prefs } from './prefs.js';
import { soundOn, audioPrefs } from './sound.js';
import { qrCanvas } from './qr.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// иконки 9x9: a = цветът на раздела, b = тъмен контур, c = светло
const ICONS = {
  look: ['.........', '.bbbbbbb.', '.baaaaab.', '.bacccab.', '.bacccab.', '.baaaaab.', '.bbbbbbb.', '...bbb...', '.bbbbbbb.'],     // монитор
  alerts: ['....b....', '...bab...', '..baaab..', '..baaab..', '..baaab..', '.baaaaab.', 'bbbbbbbbb', '...bcb...', '....b....'],  // звънец
  privacy: ['..bbbbb..', '.bb...bb.', '.b.....b.', 'bbbbbbbbb', 'baaaaaaab', 'baaacaaab', 'baaacaaab', 'baaaaaaab', 'bbbbbbbbb'], // катинар
  window: ['bbbbbbbbb', 'bacaccacb', 'bbbbbbbbb', 'b.......b', 'b.aaaaa.b', 'b.aaaaa.b', 'b.......b', 'b.......b', 'bbbbbbbbb'],  // прозорец
  share: ['......bb.', '.....baab', '..bb.baab', '.baab.bb.', '.baaaab..', '.baab.bb.', '..bb.baab', '.....baab', '......bb.'],  // споделяне
  help: ['..bbbbb..', '.baaaaab.', 'baab.baab', '....baab.', '...baab..', '...bab...', '...bbb...', '...bab...', '...bbb...'],     // въпрос
};
const SECTIONS = { look: '#4a8fe0', alerts: '#e04a6b', privacy: '#b04ae0', window: '#e07a4a', share: '#4ac26b', help: '#e0c24a' };
const urls = {};
function iconUrl(key) {
  if (urls[key]) return urls[key];
  const c = document.createElement('canvas'), g = c.getContext('2d'), col = { a: SECTIONS[key], b: '#0e0c14', c: '#f6f3ea' };
  c.width = 9; c.height = 9;
  ICONS[key].forEach((row, j) => { for (let i = 0; i < 9; i++) if (col[row[i]]) { g.fillStyle = col[row[i]]; g.fillRect(i, j, 1, 1); } });
  return (urls[key] = c.toDataURL());
}
const icon = (key) => `<i class="ico" style="background-image:url(${iconUrl(key)})"></i>`;

// превключвател (пикселен) с заглавие и едно изречение обяснение
const sw = (attrs, on, title, hint) => `<label class="opt"><span><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="sw" ${attrs}${on ? ' checked' : ''}></label>`;
const card = (name, value, on, title, hint) => `<label class="card"><input type="radio" name="${name}" value="${value}" id="${name}-${value}"${on ? ' checked' : ''}><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</label>`;
const btn = (attrs, text) => `<button type="button" ${attrs}>${text}</button>`;

/** Приложението в Windows: бутон „Изтегли и инсталирай“ и докъде е стигнало (D.upd от electron/main.js). */
function updInstall(u = {}, H) {
  if (u.state === 'download') return `<p class="dim">${H.updDownloading(u.pct || 0)}</p>`;
  if (u.state === 'install') return `<p class="dim">${H.updInstalling}</p>`;
  return `<div class="btns">${btn('data-act="update-install"', H.updInstall)}</div><p class="dim">${H.updInstallHint}</p>` +
    (u.state === 'error' ? `<p class="err">${H.updError(esc(u.err || ''))}</p>` : '');
}

/** Включеният изглед за телефон: адресите, PIN-ът, бутон за нов PIN. */
function lanBox(N, H) {
  if (N.error && !N.running) return `<p class="err">${H.lanErr}</p>`;
  const urls = N.urls.length ? N.urls.map((u) => `<code>${esc(u)}</code>`).join(' ') : `<span class="err">${H.lanNoNet}</span>`;
  // QR кодът на първия адрес (192.168.x – домашната/офисната Wi-Fi) – камерата на телефона го отваря направо
  const qr = N.urls.length ? qrCanvas(N.urls[0], 4) : null;
  return `<div class="lanbox">${qr ? `<img class="qr" alt="QR" src="${qr.toDataURL()}" title="${esc(H.lanQr)}">` : ''}<p>${H.lanOpen} ${urls}</p><p>${H.lanPin}: <b class="pin">${esc(N.pin)}</b> · <span class="dim">${H.lanPhones(N.phones)}</span></p>` +
    `<div class="btns">${btn('data-lanpin', H.lanNewPin)}</div></div>`;
}

/** Още папки с транскрипти (Docker, VM…): списъкът, поле за път (+ „Избери…“ в приложението), Cowork задачите. */
function foldersBox(F, ui, H) {
  const row = (f, env) => `<li><code title="${esc(f.path)}">${esc(f.path)}</code>${f.found ? '' : ` <small class="dim">${H.folderEmpty}</small>`}` +
    (env ? ` <small class="dim">${H.folderEnv}</small>` : ` <button type="button" class="mini" data-folderdel="${esc(f.path)}" title="${H.folderDel}">✕</button>`) + '</li>';
  const list = [...F.env.map((f) => row(f, true)), ...F.folders.map((f) => row(f, false))];
  return `<h4>${H.folders}</h4><p class="dim">${H.foldersHint}</p>` +
    (list.length ? `<ul class="folders">${list.join('')}</ul>` : '') +
    `<div class="btns folderadd"><input type="text" data-folderin placeholder="${esc(H.folderPath)}" spellcheck="false">${btn('data-folderadd', H.folderAdd)}` +
    (ui.bridge?.pickFolder ? btn('data-folderpick', H.folderPick) : '') + '</div>' +
    (ui.folderErr ? `<p class="err">${esc(H.folderErr[ui.folderErr] || ui.folderErr)}</p>` : '') +
    (F.cowork ? `<p class="dim">${H.cowork(F.cowork)}</p>` : '') +
    `<div class="btns"><a href="https://github.com/rezored/cubicle-crew/blob/main/docs/docker.md" target="_blank" rel="noopener">${H.folderHowto}</a></div>`;
}

/** Съдържанието на всеки раздел ('' = разделът не се показва тук). ui – за състоянието (легенда, hook, обновления…). */
function sections(ui) {
  const H = T.help, D = ui.desk, demo = ui.conn === 'demo', U = ui.update;
  const out = {};
  // как изглежда
  out.look = `<div class="cards">${card('mode', 'office', !prefs.focus, H.office, H.officeHint)}${card('mode', 'focus', prefs.focus, H.focus, H.focusHint)}</div>` +
    (D ? sw('id="desk-strip" data-desk="strip"', D.strip, H.strip, H.stripHint) : '') +
    sw('id="opt-legend" data-legend', !ui.legend.hidden, H.legend, H.legendHint) +
    sw('id="pref-lights" data-pref="lights"', prefs.lights, H.lights, H.lightsHint) +
    sw('id="pref-lamp" data-pref="lamp"', prefs.lamp, H.lamp, H.lampHint) +
    sw('id="pref-calm" data-pref="calm"', prefs.calm, H.calm, H.calmHint) +
    `<div class="row"><b>${H.atmos}</b><div class="seg">${['full', 'soft', 'off'].map((k) => card('atmos', k, prefs.atmosKey === k, H.atmosOpt[k])).join('')}</div></div><small class="dim">${H.atmosHint}</small>` +
    `<div class="row"><b>${H.lang}</b><div class="seg">${card('lang', 'bg', LANG === 'bg', 'Български')}${card('lang', 'en', LANG === 'en', 'English')}</div></div>` +
    // леко за машината: пестене на батерията + брояч на кадрите (колко струва офисът)
    `<h4>${H.perfTitle}</h4>` +
    sw('id="pref-saver" data-pref="saver"', prefs.saver, H.saver, H.saverHint) +
    sw('id="pref-perf" data-pref="perf"', prefs.perf, H.perf, H.perfHint);
  // кога те вика
  // звуците на офиса (синтезирани, без файлове): клик по предметите, фон, lofi и общата им сила
  const vol = Math.round(audioPrefs.vol * 100);
  const office = `<h4>${H.sfxTitle}</h4>` +
    sw('id="aud-sfx" data-audio="sfx"', audioPrefs.sfx, H.sfx, H.sfxHint) +
    sw('id="aud-amb" data-audio="ambient"', audioPrefs.ambient, H.ambient, H.ambientHint) +
    sw('id="aud-lofi" data-audio="lofi"', audioPrefs.lofi, H.lofi, H.lofiHint) +
    `<label class="opt"><span><b>${H.volume} <output>${vol}%</output></b><small>${H.volumeHint}</small></span>` +
    `<input type="range" class="range" min="0" max="100" step="5" value="${vol}" data-audiorange="vol"></label>`;
  out.alerts = (!demo ? sw('id="opt-sound" data-sound', soundOn(), H.sound, H.soundHint) : '') +
    (D ? sw('id="desk-notify" data-desk="notify"', D.notify, H.notify, H.notifyHint) + sw('id="desk-autohide" data-desk="autoHide"', D.autoHide, H.autoHide, H.autoHideHint) : '') +
    (!demo ? sw('id="opt-perm" data-hook', !!ui.hook?.installed, H.perm, H.permHint) + (ui.hookErr ? `<p class="err">${ui.hookErr}</p>` : '') : '') +
    office;
  // какво вижда и какво излиза от компютъра
  const N = ui.lan?.ok ? ui.lan : null;
  out.privacy = sw('id="pref-private" data-pref="private"', prefs.private, H.private, H.privateHint) +
    (N && !demo ? sw('id="opt-lan" data-lan', N.enabled, H.lan, H.lanHint) + (N.enabled ? lanBox(N, H) : '') : '') +
    (ui.folders?.ok && !demo ? foldersBox(ui.folders, ui, H) : '') +
    (U && !demo ? sw('id="opt-update" data-upd', U.enabled, H.update, H.updateHint) +
      `<p class="dim ver">${esc(H.version(U.current))}${U.newer ? ` · <a href="${esc(U.latest.url)}" target="_blank" rel="noopener">${esc(H.newer(U.latest.version))}</a>` : U.latest ? ` · ${H.latest}` : ''}${U.enabled && !U.newer ? ` · <a href="#" data-updcheck>${H.checkNow}</a>` : ''}</p>` +
      (U.newer && D?.selfUpdate ? updInstall(D.upd, H) : '') : '') +
    `<h4>${H.data}</h4><p class="dim">${H.dataHint}</p><div class="btns">` +
    (!demo ? btn('data-go="stats"', H.openStats) : '') + btn('data-go="weather"', H.openWeather) +
    `<a href="https://github.com/rezored/cubicle-crew/blob/main/docs/security.md" target="_blank" rel="noopener">${H.security}</a></div>`;
  // прозорецът (само в приложението)
  out.window = D ? `<h4>${H.place}</h4><div class="btns">${btn('data-act="reset-size"', H.resetSize)}${btn('data-act="reset-place"', H.resetPlace)}${btn('data-act="browser"', H.browser)}</div>` +
    sw('id="desk-ontop" data-desk="onTop"', D.onTop, H.onTop, H.onTopHint) +
    (D.opacity != null ? `<label class="opt"><span><b>${H.opacity} <output>${Math.round(D.opacity * 100)}%</output></b><small>${H.opacityHint}</small></span>` +
      `<input type="range" class="range" min="25" max="100" step="5" value="${Math.round(D.opacity * 100)}" data-deskrange="opacity"></label>` : '') +
    (D.canClear ? sw('id="desk-clear" data-desk="clear"', D.clear, H.clear, H.clearHint) : '') +
    sw('id="desk-through" data-desk="through"', D.through, H.through, H.throughHint) +
    (D.platform !== 'darwin' ? sw('id="desk-taskbar" data-desk="taskbar"', D.taskbar, H.taskbar, H.taskbarHint) : '') +
    sw('id="desk-wait" data-desk="waitWindow"', D.waitWindow, H.wait, H.waitHint) +
    (D.canLogin ? sw('id="desk-login" data-desk="login"', D.login, D.platform === 'darwin' ? H.loginMac : H.login, H.loginHint) : '') +
    sw('id="desk-demo" data-desk="demo"', D.demo, H.demo, H.demoHint) : '';
  // сподели
  out.share = `<div class="btns big">${btn('data-snap', H.snapshot)}${btn('data-clip', H.clip)}</div><p class="dim">${H.shareHint}</p>`;
  // помощ: цветовете, клавишите, обратна връзка
  out.help = `<h4>${H.colours}</h4><ul class="states">` + STATE_ORDER.map((st) => `<li data-state="${st}"><i style="background:${STATES[st].color}"></i><span><b>${T.states[st]}</b> – ${esc(H.states[st].replace(/^[^–]*–\s*/, ''))}</span></li>`).join('') + '</ul>' +
    `<p class="dim">${H.shapes}</p><p class="dim"><span class="danger">⚠</span> ${H.danger}</p>` +
    `<h4>${H.keysTitle}</h4><table class="keys">${H.keys.filter(([k]) => D || !k.includes('Ctrl+Alt')).map(([k, v]) => `<tr><th><kbd>${k}</kbd></th><td>${v}</td></tr>`).join('')}</table>` +
    `<h4>${H.agentsTitle}</h4><p class="dim">${H.agentsHint}</p><div class="btns"><a href="https://github.com/rezored/cubicle-crew/blob/main/docs/api.md" target="_blank" rel="noopener">${H.agentsLink}</a></div>` +
    `<h4>${H.feedback}</h4><p class="dim">${H.feedbackHint}</p><div class="btns">` +
    `<a href="https://github.com/rezored/cubicle-crew/discussions" target="_blank" rel="noopener">${H.discuss}</a>` +
    `<a href="https://github.com/rezored/cubicle-crew/issues/new" target="_blank" rel="noopener">${H.issue}</a>` +
    `<a href="https://buymeacoffee.com/rezored" target="_blank" rel="noopener">${H.coffee}</a></div>`;
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/** Целият панел за раздела tab (ако го няма – първият). Връща { html, tab }. */
export function settingsHtml(ui, tab) {
  const H = T.help, all = sections(ui), keys = Object.keys(all);
  if (!all[tab]) tab = keys[0];
  const nav = keys.map((k) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}" style="--acc:${SECTIONS[k]}">${icon(k)}<span>${H.sections[k]}</span></button>`).join('');
  const ver = ui.update?.current ? `<small class="v">Cubicle Crew ${esc(ui.update.current)}</small>` : '';
  const html = `<div class="set-panel" style="--acc:${SECTIONS[tab]}">` +
    `<aside><div class="brand"><b>${H.title}</b></div><nav>${nav}</nav>${ver}</aside>` +
    `<section><header><h2>${icon(tab)}${H.sections[tab]}</h2><button type="button" class="x" data-close title="${H.close} (Esc)">✕</button></header>` +
    `<div class="body">${all[tab]}</div></section></div>`;
  return { html, tab };
}
