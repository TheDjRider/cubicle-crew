// Споделяне: снимка (PNG) и 10-секунден клип (MP4, ако браузърът може, иначе WebM) на сцената.
// Сцената се увеличава с цяло число (остри пиксели) до ~1280 px широчина; долу вдясно – малък надпис.
// Само сцената (етикетите са DOM и не влизат). Файлът се сваля локално – нищо не се качва никъде.
const TARGET_W = 1280, CLIP_MS = 10000;

function upscaled(src) {
  const k = Math.max(1, Math.round(TARGET_W / src.width));
  const c = document.createElement('canvas');
  c.width = src.width * k; c.height = src.height * k;
  return { c, g: c.getContext('2d'), k };
}
function draw({ c, g }, src) {
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  const fs = Math.max(12, Math.round(c.height / 40));
  g.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'right'; g.textBaseline = 'bottom';
  g.fillStyle = 'rgba(14,10,22,0.55)';
  const w = g.measureText('Cubicle Crew').width;
  g.fillRect(c.width - w - fs * 1.4, c.height - fs * 1.9, w + fs * 1.4, fs * 1.9);
  g.fillStyle = '#ffe27a';
  g.fillText('Cubicle Crew', c.width - fs * 0.7, c.height - fs * 0.45);
}
function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

export class Capture {
  constructor(canvas) { this.canvas = canvas; this.rec = null; }

  get recording() { return !!this.rec; }

  /** Снимка на сцената в момента. */
  snapshot() {
    const u = upscaled(this.canvas);
    draw(u, this.canvas);
    u.c.toBlob((b) => b && save(b, `cubicle-crew-${stamp()}.png`), 'image/png');
  }

  /** 10 s клип; onDone(ok) – когато файлът е готов. Кадрите идват от frame() в main.js. */
  clip(onDone) {
    if (this.rec || typeof MediaRecorder === 'undefined') { onDone?.(false); return; }
    const u = upscaled(this.canvas);
    draw(u, this.canvas);
    const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) { onDone?.(false); return; }
    const stream = u.c.captureStream(30);
    const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 });
    const parts = [];
    mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    mr.onstop = () => {
      this.rec = null;
      save(new Blob(parts, { type }), `cubicle-crew-${stamp()}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
      onDone?.(true);
    };
    this.rec = { u, mr, end: performance.now() + CLIP_MS };
    mr.start(1000);
  }

  /** Всеки кадър (след рисуването на сцената): копие в увеличения канвас; спира след 10 s. */
  frame(now) {
    const r = this.rec;
    if (!r) return;
    draw(r.u, this.canvas);
    if (now >= r.end && r.mr.state === 'recording') r.mr.stop();
  }
}
