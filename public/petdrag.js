// Влачене на любимци: чиста логика без DOM (и без window), за да се тества с node --test.
// Рисуването и движението са в characters.js (Pet), мишката – в ui.js, мястото на пускане – в office.js.

/** Къде е хванат любимецът: 'head' (за главата/врата), 'body' (за тялото – форма на банан) или 'tail' (за опашката – с главата надолу).
 *  dx = отместване на мишката спрямо любимеца по посоката, накъдето гледа (напред > 0); dy = спрямо краката (нагоре < 0). */
export function grabZone(dx, dy) {
  if (dy < -7 || dx > 3) return 'head';
  if (dx < -3) return 'tail';
  return 'body';
}

/** Разтърсване: няколко бързи смени на посоката по x за кратко време. push(x, t) връща true в момента на разтърсването. */
export class ShakeDetector {
  constructor({ amp = 5, need = 4, win = 900 } = {}) { this.amp = amp; this.need = need; this.win = win; this.reset(); }
  reset() { this.ext = null; this.dir = 0; this.turns = []; }
  push(x, t) {
    if (this.ext == null) { this.ext = x; return false; }
    const d = x - this.ext;
    if (this.dir >= 0 && d <= -this.amp) { if (this.dir === 1) this.turns.push(t); this.dir = -1; this.ext = x; }
    else if (this.dir <= 0 && d >= this.amp) { if (this.dir === -1) this.turns.push(t); this.dir = 1; this.ext = x; }
    else if ((this.dir === 1 && x > this.ext) || (this.dir === -1 && x < this.ext)) this.ext = x; // още върви в същата посока
    this.turns = this.turns.filter((tt) => t - tt <= this.win);
    if (this.turns.length >= this.need) { this.reset(); return true; }
    return false;
  }
}

/** Първата свободна повърхност (бюро, място на дивана), която съдържа точката (x, y).
 *  surfaces = [{ rect: {x0, y0, x1, y1}, free: true|false, … }]; заетите (някой седи там) не се броят – падането е на пода. */
export function surfaceAt(x, y, surfaces) {
  return surfaces.find((s) => s.free && x >= s.rect.x0 && x <= s.rect.x1 && y >= s.rect.y0 && y <= s.rect.y1) || null;
}

/** Точката е в правоъгълника r = {x0, y0, x1, y1}. */
export const inRect = (pt, r) => pt.x >= r.x0 && pt.x <= r.x1 && pt.y >= r.y0 && pt.y <= r.y1;

/** Най-близката свободна точка до (x, y): първо вътре в границите bounds = {x0, x1, y0, y1}, после извън „блокираните“ места
 *  (blocked(pt) -> true, напр. масажният стол). Търси в разширяващи се пръстени; ако нищо не е свободно, връща ограничената точка. */
export function nearestFree(x, y, bounds, blocked = () => false) {
  const clampX = (v) => Math.min(bounds.x1, Math.max(bounds.x0, v)), clampY = (v) => Math.min(bounds.y1, Math.max(bounds.y0, v));
  const p0 = { x: Math.round(clampX(x)), y: Math.round(clampY(y)) };
  if (!blocked(p0)) return p0;
  for (let r = 2; r <= 80; r += 2) {
    // по-често надолу/встрани (подът е там), после нагоре
    for (const [sx, sy] of [[0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, -1], [1, -1], [-1, -1]]) {
      const p = { x: Math.round(clampX(p0.x + sx * r)), y: Math.round(clampY(p0.y + sy * r)) };
      if (!blocked(p)) return p;
    }
  }
  return p0;
}
