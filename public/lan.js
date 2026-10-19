// Изгледът за телефон (сървърът: lan.js в корена): страницата е отворена през адреса в локалната мрежа.
// Преди да се свърже, пита дали телефонът вече е влязъл (/lan/me); ако не – форма за PIN-а от компютъра.
import { T } from './config.js';

/** true = влязъл (може да се свързва); false = показана е формата за PIN. */
export async function lanGate() {
  let me = null;
  try { me = await (await fetch('lan/me', { cache: 'no-store' })).json(); } catch { /* компютърът не отговаря */ }
  if (me?.ok) return true;
  const L = T.lan;
  const box = document.createElement('form');
  box.id = 'lanlogin';
  box.innerHTML = `<b>${L.title}</b><span>${L.hint}</span>` +
    '<input name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>' +
    `<button type="submit">${L.go}</button><p class="err" hidden></p>`;
  document.body.appendChild(box);
  const inp = box.querySelector('input'), err = box.querySelector('.err');
  if (!me) { err.textContent = L.offline; err.hidden = false; }
  inp.focus();
  box.onsubmit = async (e) => {
    e.preventDefault();
    let r = null;
    try {
      const res = await fetch('lan/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: inp.value.trim() }) });
      r = await res.json();
    } catch { /* */ }
    if (r?.ok) { location.reload(); return; }
    err.textContent = !r ? L.offline : r.error === 'locked' ? L.locked : L.wrong;
    err.hidden = false; inp.value = ''; inp.focus();
  };
  return false;
}
