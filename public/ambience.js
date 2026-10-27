// Фонов звук на офиса (по желание, изключен по подразбиране): синтезиран с WebAudio, без файлове.
// Следи сцената 5 пъти в секунда (не всеки кадър) и пуска:
//  - тихи клавиатури на агентите, които пишат/пускат команди на бюрото (по-бързи при „running“, понякога Enter)
//  - кафемашина / диспенсър / дартс / аркада / вратата / мелачката, когато някой ги ползва
//  - дъжд по стъклото (по истинското време), гръм при буря; отворен прозорец – птички денем, щурци нощем
//  - много тих „въздух“ на стаята; нощем всичко е по-тихо
//  - lofi (отделен ключ): бавни акорди през мек филтър + рядко пращене като от плоча
// Във „Фокус“, ?overlay, скрит прозорец или без звук – мълчи и спира аудио нишката (audioIdle).
import { PARAMS } from './config.js';
import { prefs } from './prefs.js';
import { audioPrefs, audioOut, audioIdle, noiseSource, SFX } from './sound.js';
import { flashAt } from './weather.js';

const TICK_MS = 200;
// lofi: Fmaj7 – Em7 – Dm7 – Cmaj7 (Hz), по 8 s
const CHORDS = [[174.6, 220, 261.6, 329.6], [164.8, 196, 246.9, 293.7], [146.8, 174.6, 220, 261.6], [130.8, 164.8, 196, 246.9]];
const CHORD_S = 8;

export class Ambience {
  constructor() {
    this.last = 0;
    this.beds = null;       // { air, rain } – безкрайни шумове с собствен gain
    this.seen = new WeakMap(); // актьор -> spotSince, за да звучи кафемашината веднъж на посещение
    this.darts = 0; this.door = 0; this.chew = 0; this.flash = 0;
    this.nextChord = 0; this.chord = 0; this.lofiOut = null;
  }

  /** Може ли изобщо да звучи (настройки, режим, видим прозорец). */
  allowed(shown) {
    return shown && !prefs.focus && !PARAMS.overlay && !PARAMS.wait && !PARAMS.strip && audioPrefs.vol > 0;
  }

  tick(now, office, tod, shown) {
    if (now - this.last < TICK_MS) return;
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    const ok = this.allowed(shown), amb = ok && audioPrefs.ambient, lofi = ok && audioPrefs.lofi;
    if (!amb && !lofi) { this.stopBeds(); this.stopLofi(); audioIdle(false); return; }
    const o = audioOut();
    if (!o) return; // браузърът: още няма клик по страницата
    audioIdle(true);
    const { ac } = o, t = ac.currentTime + 0.03;
    const night = tod?.night ?? 0, quiet = 1 - 0.45 * night;
    if (lofi) this.lofi(ac, o.amb, t, quiet); else this.stopLofi();
    if (!amb) { this.stopBeds(); return; }
    this.ensureBeds(ac, o.amb);
    const W = office.room?.W || 356, pan = (x) => (x / W) * 1.4 - 0.7;
    const open = office.pokes?.openWindows() || 0;
    // фонове: въздух (климатик), дъжд (по-силен през отворен прозорец)
    const wx = tod?.wx, rain = wx?.rain || 0;
    this.beds.air.gain.setTargetAtTime(0.05 * quiet, t, 0.8);
    this.beds.rain.gain.setTargetAtTime(rain ? (0.05 + 0.12 * rain) * (open ? 1.8 : 1) : 0, t, 1.2);
    const play = (name, x, at = t) => SFX[name](ac, o.amb, at, pan(x));
    if (rain && Math.random() < dt * 6 * rain) play('drop', Math.random() * W, t + Math.random() * 0.2);
    // гръм малко след светкавицата
    const fl = flashAt(wx, now);
    if (fl > 0.9 && !this.flash) play('thunder', W * 0.3, t + 0.6 + Math.random());
    this.flash = fl > 0.9 ? 1 : 0;
    // отворен прозорец: птички денем, щурци нощем
    if (open && !rain) {
      if (night < 0.5 && Math.random() < dt * 0.35 * open) play('bird', office.pokes.openX(), t + Math.random() * 0.2);
      if (night >= 0.5 && Math.random() < dt * 1.2 * open) play('cricket', office.pokes.openX(), t + Math.random() * 0.2);
    }
    // хората: клавиатури и почивката
    const L = office.L;
    let typists = 0;
    for (const a of office.actors.values()) {
      if (a.alpha < 0.5) continue;
      const st = a.vstate;
      if (a.pod >= 0 && (st === 'typing' || st === 'running') && a.isAtDesk(L) && typists < 4) {
        typists++;
        const p = L.pods[a.pod], n = Math.round((st === 'running' ? 1.2 : 2) * (0.6 + Math.random() * 0.8) * (dt / 0.2));
        for (let i = 0; i < n; i++) play('key', p.cx, t + Math.random() * dt);
        if (st === 'running' && Math.random() < dt * 0.4) play('enter', p.cx, t + Math.random() * dt);
      }
      const lt = a.loc?.type;
      if (a.mode === 'idleSpot' && (lt === 'coffee' || lt === 'cooler') && this.seen.get(a) !== a.spotSince) {
        this.seen.set(a, a.spotSince);
        play(lt === 'coffee' ? 'brew' : 'glug', a.x, t + 0.4);
      }
      if (a.mode === 'idleSpot' && lt === 'arcade' && Math.random() < dt * 1.5) play('arcadeBg', a.x);
    }
    const stuck = office.darts?.stuck.length || 0;
    if (stuck > this.darts) play('dart', L.lounge.darts?.x ?? W);
    this.darts = stuck;
    const d = office.room.doorOpen || 0;
    if (d > 0.05 && this.door <= 0.05) play('door', L.door.cx);
    this.door = d;
    const chew = office.room.shredder?.chewAt || 0;
    if (chew > this.chew && now - chew < 1000) play('shred', office.room.shredder.x);
    this.chew = chew;
  }

  ensureBeds(ac, out) {
    if (this.beds) return;
    const bed = (brown, type, f, q) => {
      const s = noiseSource(ac, true, brown), fl = ac.createBiquadFilter(), g = ac.createGain();
      fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
      s.connect(fl).connect(g).connect(out); s.start();
      return { s, gain: g.gain };
    };
    this.beds = { air: bed(true, 'lowpass', 420, 0.5), rain: bed(false, 'bandpass', 2600, 0.5) };
  }

  stopBeds() {
    if (!this.beds) return;
    const b = this.beds; this.beds = null;
    for (const k of Object.keys(b)) {
      const ctx = b[k].s.context;
      b[k].gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      b[k].s.stop(ctx.currentTime + 1.2);
    }
  }

  // ---------------------------------------------------------------- lofi
  lofi(ac, out, t, quiet) {
    if (!this.lofiOut) {
      const fl = ac.createBiquadFilter(), g = ac.createGain();
      fl.type = 'lowpass'; fl.frequency.value = 900; fl.Q.value = 0.4; g.gain.value = 0;
      fl.connect(g).connect(out);
      this.lofiOut = { in: fl, g };
      this.nextChord = t + 0.2;
    }
    this.lofiOut.g.gain.setTargetAtTime(0.5 * quiet, t, 1.5);
    if (this.nextChord - t < 0.6) {
      const at = Math.max(this.nextChord, t), notes = CHORDS[this.chord++ % CHORDS.length];
      for (const [i, f] of notes.entries()) {
        for (const det of [-4, 4]) {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = 'triangle'; o.frequency.value = f; o.detune.value = det + (i === 0 ? -1200 : 0);
          g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.018, at + 1.6); g.gain.setValueAtTime(0.018, at + CHORD_S - 1.5);
          g.gain.linearRampToValueAtTime(0, at + CHORD_S + 0.8);
          o.connect(g).connect(this.lofiOut.in); o.start(at); o.stop(at + CHORD_S + 0.9);
        }
      }
      // мелодична нотка отгоре, понякога
      if (Math.random() < 0.7) {
        const o = ac.createOscillator(), g = ac.createGain(), f = notes[2 + (this.chord % 2)] * 2, s = at + 2 + Math.random() * 3;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.02, s + 0.05); g.gain.exponentialRampToValueAtTime(0.0005, s + 1.6);
        o.connect(g).connect(this.lofiOut.in); o.start(s); o.stop(s + 1.7);
      }
      this.nextChord = at + CHORD_S;
    }
    // пращене като от плоча (рядко)
    if (Math.random() < 0.5) {
      const s = noiseSource(ac), g = ac.createGain(), at = t + Math.random() * 0.2;
      g.gain.setValueAtTime(0.03 * Math.random(), at); g.gain.exponentialRampToValueAtTime(0.0005, at + 0.004);
      s.connect(g).connect(out); s.start(at, Math.random()); s.stop(at + 0.01);
    }
  }

  stopLofi() {
    if (!this.lofiOut) return;
    this.lofiOut.g.gain.setTargetAtTime(0, this.lofiOut.g.context.currentTime, 0.4);
    const l = this.lofiOut; this.lofiOut = null;
    setTimeout(() => { try { l.g.disconnect(); } catch { /* */ } }, 3000);
  }
}
