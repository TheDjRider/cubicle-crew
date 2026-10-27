// ?gl – собствен малък WebGL2 рендер: същият пикселен кадър (албедо), осветен на логическата резолюция
// (G-буфер от силуетите -> точкови светлини със сенки, слънце/луна през прозорците, снопове, отражения по пода),
// после bloom и цветова корекция в пълната резолюция. Без библиотеки; при липса на WebGL2 / загубен контекст -> 2D.
// Включва се и изключва в движение (prefs.gl, main.js syncGl): #c остава за събитията, офисът рисува в this.buf.
import { VS, GEO, LIGHT, REFLECT, BRIGHT, BLUR, FINAL } from './shaders.js';
import { sceneParams, drawEmissive, drawHint, drawKinds } from './scene.js';

const MAXL = 40;

export class GLView {
  /** Връща GLView или null (няма WebGL2 / шейдърите не се компилират). */
  static create(canvas2d, mode) {
    try {
      const v = new GLView(canvas2d, mode);
      return v.ok ? v : null;
    } catch (e) {
      console.warn('gl: off', e);
      return null;
    }
  }

  constructor(src, mode) {
    this.src = src;
    const c = (this.canvas = document.createElement('canvas'));
    c.id = 'gl';
    c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;display:block';
    const gl = (this.gl = c.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' }));
    if (!gl) return;
    // софтуерен WebGL (SwiftShader, WARP, llvmpipe) е ~100 мс/кадър – тогава по-добре обичайният 2D
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    if (/swiftshader|basic render|llvmpipe|software/i.test(name) && !/[?&]glsoft/.test(location.search)) { this.why = 'software'; return; }
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    const vs = this.shader(gl.VERTEX_SHADER, VS);
    const mk = (fs) => this.program(vs, this.shader(gl.FRAGMENT_SHADER, fs));
    this.p = { geo: mk(GEO), light: mk(LIGHT), refl: mk(REFLECT), bright: mk(BRIGHT), blur: mk(BLUR), final: mk(FINAL) };
    // един триъгълник през целия екран
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = {};
    for (const k of ['alb', 'bg', 'sky', 'emi', 'hint', 'ovl', 'kind']) this.tex[k] = this.texture(gl.RGBA8, 1, 1, gl.NEAREST);
    // помощни платна (2D): албедото (офисът рисува тук, с прозрачност), небето, светещото, подсказките, хората/кръга
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d', { alpha: true });
    this.kind = document.createElement('canvas');
    this.kindTmp = document.createElement('canvas');
    this.sky = document.createElement('canvas');
    this.emi = document.createElement('canvas');
    this.hint = document.createElement('canvas');
    this.W = 0; this.H = 0; this.layoutKey = null;
    this.lp = new Float32Array(MAXL * 4); this.lc = new Float32Array(MAXL * 4);
    this.ms = 0; // последното време за кадър (CPU страна, мс) – за ?debug
    c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (this.lost) return; this.lost = true; this.onLost?.(); });
    this.dbg = { sun: 1, geo: 2, norm: 3 }[mode] || 0;
    // колко струва кадър на видеокартата (EXT_disjoint_timer_query_webgl2, ако го има) – main.js пада на 2D, ако е скъпо
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = []; this.cost = 0;
    this.ok = true;
  }

  shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  texture(fmt, w, h, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    const type = fmt === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  target(w, h, filter, hdr = this.hdr) {
    const gl = this.gl, t = this.texture(hdr ? gl.RGBA16F : gl.RGBA8, w, h, filter);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, fb, w, h };
  }
  upload(t, canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  /** Размерът: логическият (W x H) и физическият (CSS размер * dpr). */
  resize(W, H, cssW, cssH, dpr) {
    const c = this.canvas;
    c.style.width = cssW; c.style.height = cssH;
    const dw = Math.round(parseFloat(cssW) * dpr), dh = Math.round(parseFloat(cssH) * dpr);
    if (c.width !== dw || c.height !== dh) { c.width = dw; c.height = dh; }
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    for (const cv of [this.buf, this.kind, this.kindTmp, this.sky, this.emi, this.hint]) { cv.width = W; cv.height = H; }
    const gl = this.gl;
    for (const k of ['geo', 'litT', 'scene', 'b1', 'b1t', 'b2', 'b2t']) if (this[k]) { gl.deleteTexture(this[k].t); gl.deleteFramebuffer(this[k].fb); }
    this.geo = this.target(W, H, gl.NEAREST, false);
    this.litT = this.target(W, H, gl.NEAREST);
    this.scene = this.target(W, H, gl.NEAREST);
    const w2 = Math.max(1, W >> 1), h2 = Math.max(1, H >> 1), w4 = Math.max(1, W >> 2), h4 = Math.max(1, H >> 2);
    this.b1 = this.target(w2, h2, gl.LINEAR); this.b1t = this.target(w2, h2, gl.LINEAR);
    this.b2 = this.target(w4, h4, gl.LINEAR); this.b2t = this.target(w4, h4, gl.LINEAR);
    this.layoutKey = null;
  }

  /** Небето се рисува в отделно платно (стъклото в албедото остава прозрачно). */
  skyCtx() {
    const g = this.sky.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    g.imageSmoothingEnabled = false;
    return g;
  }

  /** office.render стигна до светлините: снимаме албедото, изчистваме платното за горния слой. */
  lit(ctx, office, tod, lit, now, occupant) {
    const t0 = performance.now();
    const room = office.room;
    // статичното (фонът, подсказките) – само при нова подредба
    const key = room.bg;
    if (this.layoutKey !== key) {
      this.layoutKey = key;
      this.upload(this.tex.bg, room.bg);
      drawHint(this.hint, office);
      this.upload(this.tex.hint, this.hint);
    }
    this.upload(this.tex.alb, ctx.canvas);
    this.upload(this.tex.kind, this.kind);
    this.upload(this.tex.sky, this.sky);
    drawEmissive(this.emi, office, now, occupant);
    this.upload(this.tex.emi, this.emi);
    this.params = sceneParams(office, tod, lit, now, occupant, this.atmos ?? 1);
    ctx.clearRect(0, 0, room.W, room.H);
    this.cpu = performance.now() - t0;
  }

  /** Горният слой е нарисуван -> всички проходи. */
  present(ctx) {
    if (this.lost || !this.params) return;
    const t0 = performance.now();
    const gl = this.gl, P = this.params, W = this.W, H = this.H;
    this.upload(this.tex.ovl, ctx.canvas);
    this.measure(true);
    gl.bindVertexArray(this.vao);
    const bindT = (prog, name, unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u[name], unit); };
    const pass = (prog, tgt, w, h) => {
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null);
      gl.viewport(0, 0, w, h);
      if (prog.u.uSize) gl.uniform2f(prog.u.uSize, w, h);
      if (prog.u.uWall) gl.uniform1f(prog.u.uWall, P.wall);
    };
    const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 1) G-буфер
    let p = this.p.geo;
    pass(p, this.geo, W, H);
    bindT(p, 'uAlb', 0, this.tex.alb); bindT(p, 'uBg', 1, this.tex.bg); bindT(p, 'uHint', 2, this.tex.hint);
    draw();

    // 2) светлина
    p = this.p.light;
    pass(p, this.litT, W, H);
    bindT(p, 'uAlb', 0, this.tex.alb); bindT(p, 'uGeo', 1, this.geo.t); bindT(p, 'uBg', 2, this.tex.bg);
    bindT(p, 'uSky', 3, this.tex.sky); bindT(p, 'uEmi', 4, this.tex.emi); bindT(p, 'uHint', 5, this.tex.hint); bindT(p, 'uKind', 6, this.tex.kind);
    const n = Math.min(MAXL, P.lights.length);
    this.lp.fill(0); this.lc.fill(0);
    for (let i = 0; i < n; i++) { const l = P.lights[i]; this.lp.set([l.x, l.y, l.z, l.r], i * 4); this.lc.set([l.c[0] * l.i, l.c[1] * l.i, l.c[2] * l.i, l.sh ? 1 : 0], i * 4); }
    gl.uniform1i(p.u.uN, n);
    gl.uniform4fv(p.u.uLP, this.lp); gl.uniform4fv(p.u.uLC, this.lc);
    gl.uniform3fv(p.u.uAmbSky, P.ambSky); gl.uniform3fv(p.u.uAmbGround, P.ambGround);
    gl.uniform3fv(p.u.uSunDir, P.sunDir); gl.uniform3fv(p.u.uRim, P.rim); gl.uniform3fv(p.u.uObjFill, P.objFill); gl.uniform3fv(p.u.uSunCol, P.sunCol);
    gl.uniform1f(p.u.uSkyLum, P.skyLum); gl.uniform1f(p.u.uSkyMod, P.skyMod); gl.uniform1f(p.u.uSpread, P.spread); gl.uniform1f(p.u.uShaft, P.shaft); gl.uniform1f(p.u.uEmiK, P.emiK);
    if (p.u.uTime) gl.uniform1f(p.u.uTime, P.time);
    gl.uniform1f(p.u.uFlash, P.flash);
    gl.uniform1i(p.u.uDbg, this.dbg);
    draw();

    // 3) отражения
    p = this.p.refl;
    pass(p, this.scene, W, H);
    bindT(p, 'uLit', 0, this.litT.t); bindT(p, 'uGeo', 1, this.geo.t); bindT(p, 'uHint', 2, this.tex.hint);
    gl.uniform1f(p.u.uRefl, P.refl);
    draw();

    // 4) bloom: 1/2 и 1/4
    p = this.p.bright;
    pass(p, this.b1, this.b1.w, this.b1.h);
    bindT(p, 'uSrc', 0, this.scene.t);
    gl.uniform2f(p.u.uTexel, 1 / W, 1 / H); gl.uniform1f(p.u.uThresh, P.thresh);
    draw();
    const blur = (a, b) => {
      const q = this.p.blur;
      pass(q, b, a.w, a.h); bindT(q, 'uSrc', 0, a.t); gl.uniform2f(q.u.uDir, 1 / a.w, 0); draw();
      pass(q, a, a.w, a.h); bindT(q, 'uSrc', 0, b.t); gl.uniform2f(q.u.uDir, 0, 1 / a.h); draw();
    };
    blur(this.b1, this.b1t);
    p = this.p.bright;
    pass(p, this.b2, this.b2.w, this.b2.h);
    bindT(p, 'uSrc', 0, this.b1.t);
    gl.uniform2f(p.u.uTexel, 1 / this.b1.w, 1 / this.b1.h); gl.uniform1f(p.u.uThresh, 0);
    draw();
    blur(this.b2, this.b2t); blur(this.b2, this.b2t);

    // 5) екранът
    p = this.p.final;
    const cw = this.canvas.width, ch = this.canvas.height;
    gl.useProgram(p.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    bindT(p, 'uScene', 0, this.scene.t); bindT(p, 'uB1', 1, this.b1.t); bindT(p, 'uB2', 2, this.b2.t); bindT(p, 'uOvl', 3, this.tex.ovl);
    gl.uniform2f(p.u.uOut, cw, ch);
    gl.uniform1f(p.u.uBloom, P.bloom); gl.uniform1f(p.u.uExpo, P.expo); gl.uniform1f(p.u.uSat, P.sat);
    gl.uniform1f(p.u.uContrast, P.contrast); gl.uniform1f(p.u.uVig, P.vig);
    if (p.u.uTime) gl.uniform1f(p.u.uTime, P.time);
    gl.uniform3fv(p.u.uLift, P.lift); gl.uniform3fv(p.u.uGain, P.gain);
    draw();
    this.measure(false);
    this.ms = this.cpu + (performance.now() - t0);
    // без таймер: оценка по процесорното време (по-груба, но все пак сигнал)
    if (!this.timer) this.cost = this.cost * 0.9 + this.ms * 0.1;
  }

  /** Заявка за времето на видеокартата: по една на кадър, резултатът идва след няколко кадъра. */
  measure(begin) {
    const gl = this.gl, T = this.timer;
    if (!T) return;
    if (begin) {
      while (this.queries.length && gl.getQueryParameter(this.queries[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = this.queries.shift();
        if (!gl.getParameter(T.GPU_DISJOINT_EXT)) this.cost = this.cost * 0.85 + (gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6) * 0.15;
        gl.deleteQuery(q);
      }
      if (this.queries.length > 4) return;
      this.q = gl.createQuery();
      gl.beginQuery(T.TIME_ELAPSED_EXT, this.q);
    } else if (this.q) { gl.endQuery(T.TIME_ELAPSED_EXT); this.queries.push(this.q); this.q = null; }
  }

  /** Хората (r), кръгът „чака“ (g) и зоната около чакащия (b) – в същия ред по дълбочина като офиса. */
  kinds(items, office, now) { drawKinds(this.kind, this.kindTmp, items, office, now); }

  /** Сутрешният екран / лентата рисуват в 2D платното – тогава GL платното се скрива. */
  show(on) {
    if (this.shown === on) return;
    this.shown = on;
    this.canvas.style.visibility = on ? '' : 'hidden';
    this.src.style.opacity = on ? '0' : '';
  }

  /** Изключване (настройката, пестене, загубен контекст): махаме платното, #c се вижда пак, видеопаметта се освобождава. */
  destroy() {
    this.canvas.remove();
    this.src.style.opacity = '';
    this.shown = undefined;
    if (!this.lost) { this.lost = true; this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  }
}
