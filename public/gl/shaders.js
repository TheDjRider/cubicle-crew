// Шейдърите на ?gl (WebGL2, GLSL ES 3.00). Всички текстури са „отгоре надолу“: ред 0 = горният ред на сцената,
// както ги качва canvas-ът; gl_FragCoord в междинните буфери е същият индекс. Само финалът към екрана обръща y.
// Светът (2.5D, наклонена проекция): x = x на екрана, y = дълбочина (стъпалата на нещото на пода), z = височина;
// екранен y = дълбочина - височина. Стената е вертикална равнина при дълбочина uWall.

export const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uSize;     // логическият размер на стаята
uniform float uWall;    // долният ръб на стената (CFG.WALL_H)
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
bool inside(ivec2 p) { return p.x >= 0 && p.y >= 0 && float(p.x) < uSize.x && float(p.y) < uSize.y; }
`;

// ---------------------------------------------------------------- 1) геометрия (G-буфер)
// Албедото е кадърът без светлини; uBg е статичният фон на стаята. Различно от фона = предмет (хора, мебели, любимци).
// Височина на пиксел от предмет = колко пиксела надолу е „стъпалото“ му (първият пиксел под него, който не е предмет).
// r = височина/255, g = вид (0 под, .25 стена, .5 предмет, 1 стъкло), b/a = нормала (x, нагоре) в 0..1.
export const GEO = COMMON + `
uniform sampler2D uAlb, uBg, uHint;
out vec4 o;
float obj(ivec2 p) {
  if (!inside(p)) return 0.0;
  vec4 a = texelFetch(uAlb, p, 0), b = texelFetch(uBg, p, 0);
  if (a.a < 0.5) return 0.0;            // стъкло (небето е отделно)
  if (b.a < 0.5) return 1.0;            // нещо пред стъклото
  vec3 d = abs(a.rgb - b.rgb);
  return step(0.013, max(d.r, max(d.g, d.b)));
}
float L(ivec2 p) { return lum(texelFetch(uAlb, p, 0).rgb); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float y = float(p.y) + 0.5;
  vec4 a = texelFetch(uAlb, p, 0);
  vec4 hint = texelFetch(uHint, p, 0);
  if (a.a < 0.5) { o = vec4(max(0.0, uWall - y) / 255.0, 1.0, 0.5, 0.5); return; }
  if (obj(p) < 0.5) {
    if (y < uWall) {
      // стена: малко релеф от яркостта (летвите, рамките), нормалата гледа към нас
      float bx = (L(p + ivec2(1, 0)) - L(p - ivec2(1, 0))) * 0.6;
      float bu = (L(p - ivec2(0, 1)) - L(p + ivec2(0, 1))) * 0.6;
      o = vec4((uWall - y) / 255.0, 0.25, clamp(0.5 - bx * 0.5, 0.0, 1.0), clamp(0.5 + bu * 0.5, 0.0, 1.0));
    } else o = vec4(0.0, 0.0, 0.5, 1.0);
    return;
  }
  int k = 1;
  for (; k < 120; k++) if (obj(p + ivec2(0, k)) < 0.5) break;
  float foot = y - 0.5 + float(k);
  // окачено по стената (часовник, табла, лампите горе): стъпалото е над пода -> стена
  if (foot <= uWall + 1.0) {
    float bx = (L(p + ivec2(1, 0)) - L(p - ivec2(1, 0))) * 0.8;
    o = vec4(max(0.0, uWall - y) / 255.0, 0.25, clamp(0.5 - bx * 0.5, 0.0, 1.0), 0.5);
    return;
  }
  float h = float(k) - 0.5;
  // „възглавница“: към левия/десния ръб на силуета нормалата се завърта настрани
  int l = 1, r = 1;
  for (; l < 10; l++) if (obj(p - ivec2(l, 0)) < 0.5) break;
  for (; r < 10; r++) if (obj(p + ivec2(r, 0)) < 0.5) break;
  float nx = (float(l) - float(r)) / float(l + r);
  nx = sign(nx) * pow(abs(nx), 1.6) * 0.85;
  // горният ръб гледа нагоре
  int t = 1;
  for (; t < 4; t++) if (obj(p - ivec2(0, t)) < 0.5) break;
  float nu = t == 1 ? 0.7 : t == 2 ? 0.4 : t == 3 ? 0.15 : 0.0;
  // релеф от яркостта (пикселният арт вече е нарисуван със светлина отгоре-вляво)
  float gx = L(p + ivec2(1, 0)) - L(p - ivec2(1, 0));
  float gy = L(p - ivec2(0, 1)) - L(p + ivec2(0, 1));
  nx -= gx * 0.55;
  nu += gy * 0.45;
  // известни хоризонтални повърхности (плотовете на бюрата, масичката) – от uHint
  if (hint.r > 0.5) { nx *= 0.25; nu = 0.92; }
  nx = clamp(nx, -0.95, 0.95); nu = clamp(nu, -0.4, 0.97);
  o = vec4(min(h, 255.0) / 255.0, 0.5, nx * 0.5 + 0.5, nu * 0.5 + 0.5);
}`;

// ---------------------------------------------------------------- 2) светлина
export const LIGHT = COMMON + `
#define MAXL 40
uniform sampler2D uAlb, uGeo, uBg, uSky, uEmi, uHint;
uniform int uN;
uniform vec4 uLP[MAXL];   // xyz = позиция в света, w = обхват
uniform vec4 uLC[MAXL];   // rgb = цвят*сила (линейно), a = 1 -> хвърля сянка
uniform vec3 uAmbSky, uAmbGround;
uniform vec3 uSunDir, uSunCol, uRim, uObjFill;   // към слънцето (y < 0 = през стената), цвят 0 = няма
uniform float uSpread, uSkyLum, uSkyMod, uShaft, uEmiK, uTime, uFlash;
uniform int uDbg;        // ?gl=sun|geo|norm – показва междинен буфер
out vec4 o;

vec4 geo(ivec2 p) { return texelFetch(uGeo, p, 0); }
// точката P в света за пиксела p
vec3 worldOf(ivec2 p, vec4 g) {
  float h = g.r * 255.0, y = float(p.y) + 0.5;
  if (g.g < 0.1) return vec3(float(p.x) + 0.5, y, 0.0);
  return vec3(float(p.x) + 0.5, y + h, h);
}
// пресича ли нещо (предмет) отсечката от P към целта? selfFoot – „стъпалото“ на самия пиксел (-1 за пода)
float occluded(vec3 P, vec3 D, float len, float selfFoot, float stepPx) {
  float n = min(40.0, floor(min(len, 72.0) / stepPx));
  float jit = 0.5, hits = 0.0;
  for (float i = 1.0; i <= 40.0; i++) {
    if (i > n) break;
    vec3 Q = P + D * ((i + jit) * stepPx);
    ivec2 s = ivec2(floor(Q.x), floor(Q.y - Q.z));
    if (!inside(s)) break;
    vec4 g = geo(s);
    if (g.g > 0.4 && g.g < 0.6) {
      float fs = float(s.y) + 0.5 + g.r * 255.0;
      // тънките неща (крака на маса) дават частична сянка, не пунктир
      if (Q.y <= fs + 0.5 && Q.y >= fs - 10.0 && abs(fs - selfFoot) > 1.5) { hits += 1.0; if (hits >= 3.0) return 1.0; }
    }
  }
  return hits / 3.0;
}
// светлина отвън: лъч от P към слънцето до равнината на стената – стъкло ли е там (фонът е прозрачен)?
vec3 window(vec3 P, vec3 S) {
  if (S.y > -0.01 || P.y < uWall) return vec3(0.0);
  float t = (P.y - uWall) / -S.y;
  vec3 H = P + S * t;
  ivec2 sp = ivec2(floor(H.x), floor(uWall - H.z));
  if (!inside(sp)) return vec3(0.0);
  float glass = 1.0 - texelFetch(uBg, sp, 0).a;
  if (glass < 0.5) return vec3(0.0);
  // какво се вижда през стъклото на това място (облаци, капки, рамката) оцветява петното
  vec3 sky = texelFetch(uSky, sp, 0).rgb;
  float k = clamp(0.7 + (lum(sky) - uSkyLum) * uSkyMod, 0.25, 1.4);
  return vec3(k * glass);
}
// меко петно: няколко посоки около слънцето (uSpread – малко за слънцето, голямо за разсеяното небе)
vec3 windowSoft(vec3 P, vec3 S) {
  vec3 w = window(P, S) * 2.0;
  w += window(P, normalize(S + vec3(uSpread, 0.0, 0.0)));
  w += window(P, normalize(S - vec3(uSpread, 0.0, 0.0)));
  w += window(P, normalize(S + vec3(0.0, 0.0, uSpread)));
  w += window(P, normalize(S - vec3(0.0, 0.0, uSpread)));
  return w / 6.0;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uAlb, p, 0);
  vec4 g = geo(p);
  vec4 emi = texelFetch(uEmi, p, 0);
  vec4 hint = texelFetch(uHint, p, 0);
  vec3 alb = lin(a.rgb);
  float typ = g.g;
  vec3 P = worldOf(p, g);
  vec3 N;
  if (typ < 0.1) N = vec3(0.0, 0.0, 1.0);
  else {
    float nx = g.b * 2.0 - 1.0, nu = g.a * 2.0 - 1.0;
    N = normalize(vec3(nx, sqrt(max(0.02, 1.0 - nx * nx - nu * nu)), nu));
  }
  vec3 col;
  if (typ > 0.9) {
    // стъклото: небето свети само (плюс отблясъците от фона)
    vec3 sky = lin(texelFetch(uSky, p, 0).rgb);
    col = sky * 1.05 + alb * a.a * (uAmbSky + 0.3);
  } else {
    float selfFoot = typ > 0.4 && typ < 0.6 ? P.y : -100.0;
    vec3 V = normalize(vec3(0.0, 1.0, 1.1));
    float gloss = typ < 0.1 ? hint.b : (hint.r > 0.5 ? 0.5 : 0.12);
    // околна: небе отгоре, отразено от пода отдолу
    vec3 amb = mix(uAmbGround, uAmbSky, clamp(N.z * 0.5 + 0.5, 0.0, 1.0));
    if (typ > 0.2 && typ < 0.3) amb *= 0.9;
    vec3 acc = amb + vec3(uFlash);
    vec3 spec = vec3(0.0);
    // слънце/луна през прозорците
    if (uSunCol.r + uSunCol.g + uSunCol.b > 0.001) {
      float ndl = dot(N, uSunDir);
      if (ndl > 0.0) {
        vec3 w = windowSoft(P, uSunDir);
        if (w.r > 0.0) {
          float len = (P.y - uWall) / -uSunDir.y;
          float sh = occluded(P, uSunDir, len, selfFoot, 1.5);
          // петното е еднакво ярко при ниско и високо слънце (окото се адаптира) – иначе вечер почти не се вижда
          float e = min(1.6, ndl / max(0.3, uSunDir.z));
          acc += uSunCol * w * e * (1.0 - sh * 0.85);
        }
      }
    }
    for (int i = 0; i < MAXL; i++) {
      if (i >= uN) break;
      vec4 lp = uLP[i], lc = uLC[i];
      vec3 Lv = lp.xyz - P;
      float d = length(Lv);
      if (d >= lp.w) continue;
      vec3 l = Lv / max(d, 0.001);
      float ndl = dot(N, l);
      float wrap = max(0.0, (ndl + 0.25) / 1.25);
      if (wrap <= 0.0) continue;
      float q = d / lp.w;
      float att = clamp(1.0 - q * q * q * q, 0.0, 1.0);
      att = att * att / (1.0 + 9.0 * q * q);
      float sh = 0.0;
      if (lc.a > 0.5) sh = occluded(P, l, d - 3.0, selfFoot, 1.5);
      vec3 li = lc.rgb * att * (1.0 - sh * 0.8);
      acc += li * wrap;
      vec3 Hh = normalize(l + V);
      spec += li * pow(max(0.0, dot(N, Hh)), 24.0) * gloss * 1.4;
    }
    // контражур: ръбовете на силуетите (нормала настрани/нагоре) хващат светлината от прозорците зад тях
    if (typ > 0.4 && typ < 0.6) {
      float back = clamp(1.0 - N.y, 0.0, 1.0);
      float nearWin = clamp(1.0 - (P.y - uWall) / 90.0, 0.0, 1.0);
      acc += uRim * back * back * back * (0.35 + 0.65 * nearWin);
      acc += uObjFill; // хората и мебелите не потъват в тъмното (четимост нощем)
    }
    col = alb * acc + spec;
    // светещото: екраните, лампите, неонът (r – цялото, g – само ярките пиксели)
    float bright = smoothstep(0.42, 0.85, max(a.r, max(a.g, a.b)));
    col += alb * uEmiK * (emi.r + emi.g * bright) * 1.6;
  }
  // снопове светлина във въздуха: пробите по лъча на погледа (над видимата повърхност), огрени ли са през стъклото
  if (uShaft > 0.0) {
    float sy = float(p.y) + 0.5, acc = 0.0;
    float z0 = typ > 0.9 ? max(0.0, uWall - sy) : P.z;
    for (float i = 0.0; i < 12.0; i++) {
      float z = z0 + 2.0 + i * 5.5;
      vec3 Q = vec3(float(p.x) + 0.5, sy + z, z);
      if (Q.y < uWall + 0.5 || Q.z > 70.0) continue;
      vec3 w = window(Q, uSunDir);
      acc += w.r;
    }
    col += uSunCol * acc * uShaft;
  }
  o = vec4(col, 1.0);
  if (uDbg == 1) o = vec4(window(P, uSunDir) * max(0.0, dot(N, uSunDir)), 1.0);
  else if (uDbg == 2) o = vec4(g.r * 255.0 / 60.0, g.g, typ > 0.9 ? 1.0 : 0.0, 1.0);
  else if (uDbg == 3) o = vec4(N * 0.5 + 0.5, 1.0);
}`;

// ---------------------------------------------------------------- 3) отражения по пода (лъскав паркет; килимите – не)
export const REFLECT = COMMON + `
uniform sampler2D uLit, uGeo, uHint;
uniform float uRefl;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uLit, p, 0).rgb;
  vec4 g = texelFetch(uGeo, p, 0);
  float gloss = texelFetch(uHint, p, 0).b;
  if (g.g < 0.1 && gloss > 0.01 && uRefl > 0.0) {
    // огледалният образ на точка на височина h над стъпалото f е на екранен ред f + h -> търсим нагоре по колоната
    for (int k = 2; k < 70; k++) {
      ivec2 s = p - ivec2(0, k);
      if (s.y < 0) break;
      vec4 q = texelFetch(uGeo, s, 0);
      if (q.g < 0.1) continue;
      float hs = q.r * 255.0;
      if (2.0 * hs + 0.5 >= float(k)) {
        // леко размазано по хоризонтала (дъските не са огледало)
        vec3 r = texelFetch(uLit, s, 0).rgb * 0.5 + texelFetch(uLit, s + ivec2(1, 0), 0).rgb * 0.25 + texelFetch(uLit, s - ivec2(1, 0), 0).rgb * 0.25;
        float fade = max(0.0, 1.0 - float(k) / 46.0);
        // отразява се главно светлото (прозорци, лампи, екрани) – тъмните мебели биха били „призраци“
        c += r * smoothstep(0.25, 1.2, max(r.r, max(r.g, r.b))) * gloss * uRefl * fade * fade;
        break;
      }
    }
  }
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- 4) bloom: ярката част + размазване
export const BRIGHT = COMMON + `
uniform sampler2D uSrc;
uniform vec2 uTexel;     // 1/размера на източника
uniform float uThresh;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / (uSize);   // uSize тук = размерът на целта
  vec3 c = vec3(0.0);
  c += texture(uSrc, uv + uTexel * vec2(-0.5, -0.5)).rgb;
  c += texture(uSrc, uv + uTexel * vec2(0.5, -0.5)).rgb;
  c += texture(uSrc, uv + uTexel * vec2(-0.5, 0.5)).rgb;
  c += texture(uSrc, uv + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(uThresh, uThresh + 0.5, l), 1.0);
}`;
export const BLUR = COMMON + `
uniform sampler2D uSrc;
uniform vec2 uDir;       // (1/w, 0) или (0, 1/h)
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 c = texture(uSrc, uv).rgb * 0.227027;
  c += (texture(uSrc, uv + uDir * 1.384615).rgb + texture(uSrc, uv - uDir * 1.384615).rgb) * 0.316216;
  c += (texture(uSrc, uv + uDir * 3.230769).rgb + texture(uSrc, uv - uDir * 3.230769).rgb) * 0.070270;
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- 5) към екрана (физически пиксели)
// Сцената – най-близкият пиксел (остро), bloom – гладко отгоре (това е „HD“-то в HD-2D), после тонове, цветова
// корекция за часа, винетка и накрая DOM-подобният горен слой (иконки, частици) без светлина.
export const FINAL = `#version 300 es
precision highp float;
uniform sampler2D uScene, uB1, uB2, uOvl;
uniform vec2 uOut;
uniform float uBloom, uExpo, uSat, uContrast, uVig, uTime;
uniform vec3 uLift, uGain;
out vec4 o;
vec3 tone(vec3 x) {
  // меко рамо: под 0.75 нищо не се променя (цветовете на арта остават), над него – плавно към 1
  vec3 t = 0.75 + 0.25 * (1.0 - exp(-(x - 0.75) / 0.25));
  return mix(x, t, step(0.75, x));
}
void main() {
  vec2 uv = vec2(gl_FragCoord.x / uOut.x, 1.0 - gl_FragCoord.y / uOut.y);
  vec3 c = texture(uScene, uv).rgb;
  vec3 b = texture(uB1, uv).rgb * 0.6 + texture(uB2, uv).rgb * 0.8;
  c += b * uBloom;
  c *= uExpo;
  c = tone(c);
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  // цветова корекция
  c = uLift + c * (uGain - uLift);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  vec2 q = uv - 0.5;
  float v = smoothstep(0.35, 0.95, length(q * vec2(1.0, 1.25)));
  c *= 1.0 - v * uVig;
  // горният слой (без светлина)
  vec4 ov = texture(uOvl, uv);
  c = mix(c, ov.rgb, ov.a);
  // лек шум срещу ивици в bloom-а
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
