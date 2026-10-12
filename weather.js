// Реалното време навън (по желание): Open-Meteo – безплатно, без ключ, изпращат се само координатите на града.
// Пита само сървърът и само ако потребителят е задал град (докато няма град – нито една заявка навън).
// Пази се в ~/.pixel-office/weather.json: { city, enabled, now, savedAt }.
// WS съобщение: {type:'weather', city:{name, admin1, country}|null, enabled, now:{at, temp, code, cloud, precip, pop, wind, isDay}|null}
// – без поле `agent`, старите клиенти го пропускат.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = process.env.PIXEL_OFFICE_HOME || path.join(os.homedir(), '.pixel-office');
const FILE = path.join(DIR, 'weather.json');
const EVERY_MS = 20 * 60 * 1000;   // ново време на 20 мин
const RETRY_MS = 5 * 60 * 1000;    // без интернет – пак след 5 мин
const FORECAST = process.env.WEATHER_API || 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = process.env.GEOCODING_API || 'https://geocoding-api.open-meteo.com/v1/search';

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
const str = (v, n = 80) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

export class Weather {
  constructor(broadcast, log = () => {}) {
    this.broadcast = broadcast; this.log = log;
    this.s = { city: null, enabled: true, now: null, savedAt: 0, ...(readJson(FILE) || {}) };
    this.next = 0; this.busy = false;
  }

  start() { this.timer = setInterval(() => this.tick(), 60 * 1000); this.timer.unref?.(); this.tick(); }

  msg() {
    const c = this.s.city;
    return { type: 'weather', city: c ? { name: c.name, admin1: c.admin1 || '', country: c.country || '' } : null, enabled: this.s.enabled, now: this.s.enabled ? this.s.now : null };
  }

  write() {
    this.s.savedAt = Date.now();
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(this.s, null, 1));
      fs.renameSync(FILE + '.tmp', FILE);
    } catch (e) { this.log(`weather: запис – ${e.message}`); }
  }

  /** Друг Cubicle Crew (браузър + приложение) може да е сменил града – взимаме по-новия файл. */
  reload() {
    const f = readJson(FILE);
    if (f && (f.savedAt || 0) > (this.s.savedAt || 0)) { this.s = { ...this.s, ...f }; this.broadcast(this.msg()); return true; }
    return false;
  }

  async tick(force = false) {
    if (!force) this.reload();
    const c = this.s.city;
    if (!c || !this.s.enabled || this.busy) return;
    const now = Date.now();
    if (!force && (now < this.next || (this.s.now && now - this.s.now.at < EVERY_MS))) return;
    this.busy = true;
    try {
      const q = new URLSearchParams({
        latitude: String(c.lat), longitude: String(c.lon),
        current: 'temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,is_day',
        hourly: 'precipitation_probability', forecast_hours: '1', timezone: 'auto',
      });
      const r = await fetch(`${FORECAST}?${q}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), cur = j.current || {};
      if (c !== this.s.city) return; // градът е сменен междувременно
      this.s.now = {
        at: Date.now(),
        temp: num(cur.temperature_2m, -90, 70),
        code: num(cur.weather_code, 0, 99) ?? 0,
        cloud: num(cur.cloud_cover, 0, 100) ?? 0,
        precip: num(cur.precipitation, 0, 500) ?? 0,
        pop: num(j.hourly?.precipitation_probability?.[0], 0, 100),
        wind: num(cur.wind_speed_10m, 0, 500) ?? 0,
        isDay: cur.is_day === 1,
      };
      this.next = Date.now() + EVERY_MS;
      this.write();
      this.broadcast(this.msg());
    } catch (e) {
      this.next = Date.now() + RETRY_MS;
      this.log(`weather: ${e.message}`);
    } finally { this.busy = false; }
  }

  /** Търсене на град (за избора в настройките). */
  async search(name, lang) {
    name = str(name).trim();
    if (name.length < 2) return [];
    const q = new URLSearchParams({ name, count: '6', language: /^(bg|en)$/.test(lang) ? lang : 'en', format: 'json' });
    const r = await fetch(`${GEOCODE}?${q}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j.results || []).map((x) => ({ name: str(x.name), admin1: str(x.admin1), country: str(x.country), lat: x.latitude, lon: x.longitude }))
      .filter((x) => x.name && num(x.lat, -90, 90) != null && num(x.lon, -180, 180) != null)
      .filter((x, i, a) => a.findIndex((y) => y.name === x.name && y.admin1 === x.admin1 && y.country === x.country) === i); // град + община със същото име
  }

  /** POST /api/weather: {city: {...}|null} и/или {enabled: bool}. */
  async set(data) {
    if (data && 'city' in data) {
      const c = data.city;
      if (c === null) { this.s.city = null; this.s.now = null; }
      else {
        const lat = num(c?.lat, -90, 90), lon = num(c?.lon, -180, 180), name = str(c?.name).trim();
        if (lat == null || lon == null || !name) return { ok: false, error: 'city' };
        this.s.city = { name, admin1: str(c.admin1), country: str(c.country), lat, lon };
        this.s.now = null;
      }
    }
    if (data && 'enabled' in data) this.s.enabled = !!data.enabled;
    this.next = 0;
    this.write();
    this.broadcast(this.msg());
    await this.tick(true);
    return { ok: true, ...this.msg() };
  }
}
