/* 用途：首屏 Loading —— IQ《Clouds》(shadertoy XslGRr) 体素云海，零依赖、原生 WebGL1。
 * 流程：先渲染云海（最短停留 + 等待资源），再让云由浓转淡、天色向纸色靠拢散开，露出首屏。
 * 与其它脚本约定一致：通过 window.siteLoader 暴露 ready Promise，供 app.js 延迟首屏问候。
 */
(() => {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CONFIG = {
    minHold: reduced ? 800 : 2600, // 云海最短停留（毫秒）
    maxWait: 7000,                 // 等待 window.load + 字体的硬上限
    reveal: reduced ? 0 : 1150,    // 云散转场时长
  };

  const loader = document.getElementById("loader");
  const canvas = document.getElementById("cloud-canvas");

  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  window.siteLoader = { ready, skip };

  let done = false;
  let revealing = false;
  let revealStart = 0;
  let revealAmount = 0;
  let raf = 0;

  function skip() { if (!done) beginReveal(); }
  function beginReveal() {
    if (revealing || done) return;
    revealing = true;
    revealStart = performance.now();
    document.documentElement.classList.remove("is-loading");
    loader.classList.add("is-leaving");
  }
  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    loader.hidden = true;
    document.documentElement.classList.remove("is-loading");
    resolveReady();
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // ---- WebGL 初始化 ----
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" })
          || canvas.getContext("experimental-webgl");
  if (!gl) { finish(); return; }

  const VERT = "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }";

  // 以 IQ《Clouds》(shadertoy XslGRr) 为蓝本：3D simplex 噪声 + 四层 LOD FBM（map5/4/3/2）
  // + 120 步 raymarching + 自阴影光照 + 前向后混合；关键在「den > 0.01 才累积」，保证天空不被误累积。
  const FRAG = `
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform float uReveal;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

// 3D Simplex 梯度噪声（Ashima / Gustavson）：方向性变化、无环形伪影，
// 比 value noise 更接近真实云的蓬松质感，消除「水波纹」。
float noise(in vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float map5(in vec3 p) {
    vec3 q = p - vec3(0.0, 0.06, 1.3) * iTime;
    float f;
    f  = 0.50000 * noise(q); q = q * 2.02;
    f += 0.25000 * noise(q); q = q * 2.03;
    f += 0.12500 * noise(q); q = q * 2.01;
    f += 0.06250 * noise(q); q = q * 2.02;
    f += 0.03125 * noise(q);
    return clamp(1.5 - p.y - 2.0 + 2.0 * f, 0.0, 1.0);
}

float map4(in vec3 p) {
    vec3 q = p - vec3(0.0, 0.06, 1.3) * iTime;
    float f;
    f  = 0.50000 * noise(q); q = q * 2.02;
    f += 0.25000 * noise(q); q = q * 2.03;
    f += 0.12500 * noise(q); q = q * 2.01;
    f += 0.06250 * noise(q);
    return clamp(1.5 - p.y - 2.0 + 2.0 * f, 0.0, 1.0);
}

float map3(in vec3 p) {
    vec3 q = p - vec3(0.0, 0.06, 1.3) * iTime;
    float f;
    f  = 0.50000 * noise(q); q = q * 2.02;
    f += 0.25000 * noise(q); q = q * 2.03;
    f += 0.12500 * noise(q);
    return clamp(1.5 - p.y - 2.0 + 2.0 * f, 0.0, 1.0);
}

float map2(in vec3 p) {
    vec3 q = p - vec3(0.0, 0.06, 1.3) * iTime;
    float f;
    f  = 0.50000 * noise(q); q = q * 2.02;
    f += 0.25000 * noise(q);
    return clamp(1.5 - p.y - 2.0 + 2.0 * f, 0.0, 1.0);
}

vec4 integrate(in vec4 sum, in float dif, in float den, in vec3 bgcol, in float t) {
    vec3 lin = vec3(0.58, 0.61, 0.64) * 1.2 + 0.8 * vec3(0.82, 0.57, 0.36) * dif;
    vec4 col = vec4(mix(1.15 * vec3(1.0, 0.95, 0.8), vec3(0.65), den), den);
    col.xyz *= lin;
    col.xyz = mix(col.xyz, bgcol, 1.0 - exp(-0.003 * t * t));
    col.a *= 0.4;
    col.rgb *= col.a;
    return sum + col * (1.0 - sum.a);
}

vec4 raymarch(in vec3 ro, in vec3 rd, in vec3 bgcol) {
    vec4 sum = vec4(0.0);
    float t = 0.0;
    vec3 sundir = normalize(vec3(-1.0, 0.6, -1.0));

    // 四层 LOD：近处 map5 最高细节，远处 map2 最低，合计 120 步。
    for (int i = 0; i < 30; i++) {
        vec3 pos = ro + t * rd;
        if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;
        float den = map5(pos);
        if (den > 0.01) {
            float dif = clamp((den - map5(pos + 0.3 * sundir)) / 0.6, 0.0, 1.0);
            sum = integrate(sum, dif, den, bgcol, t);
        }
        t += max(0.1, 0.02 * t);
    }
    for (int i = 0; i < 30; i++) {
        vec3 pos = ro + t * rd;
        if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;
        float den = map4(pos);
        if (den > 0.01) {
            float dif = clamp((den - map4(pos + 0.3 * sundir)) / 0.6, 0.0, 1.0);
            sum = integrate(sum, dif, den, bgcol, t);
        }
        t += max(0.1, 0.02 * t);
    }
    for (int i = 0; i < 30; i++) {
        vec3 pos = ro + t * rd;
        if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;
        float den = map3(pos);
        if (den > 0.01) {
            float dif = clamp((den - map3(pos + 0.3 * sundir)) / 0.6, 0.0, 1.0);
            sum = integrate(sum, dif, den, bgcol, t);
        }
        t += max(0.1, 0.02 * t);
    }
    for (int i = 0; i < 30; i++) {
        vec3 pos = ro + t * rd;
        if (pos.y < -3.0 || pos.y > 2.0 || sum.a > 0.99) break;
        float den = map2(pos);
        if (den > 0.01) {
            float dif = clamp((den - map2(pos + 0.3 * sundir)) / 0.6, 0.0, 1.0);
            sum = integrate(sum, dif, den, bgcol, t);
        }
        t += max(0.1, 0.02 * t);
    }

    return clamp(sum, 0.0, 1.0);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;

    float time = iTime * 0.5;

    // 低空贴云飞行：机位略高于云海表面、近平视前方（轻微俯视），云的持续漂移
    // （map* 里 q = p - drift）提供前向速度，云海在下方与四周向后掠过，营造「从云中穿过」。
    // 机位小幅上下起伏 + 轻微侧倾，避免呆板、强化灵动；视线也随漂移缓缓起伏。
    float bob = sin(iTime * 0.35);
    vec3 ro = vec3(0.0, 0.9 + 0.15 * bob, 0.0);
    vec3 ta = vec3(0.0, 0.72 + 0.1 * sin(iTime * 0.23), 1.0);

    float cr = 0.18 * cos(0.16 * time);
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(sin(cr), cos(cr), 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = normalize(cross(cu, cw));
    vec3 rd = normalize(p.x * cu + p.y * cv + 1.8 * cw);

    vec3 sky = vec3(0.85, 0.90, 0.95);
    vec3 paper = vec3(0.984, 0.976, 0.949); // #faf9f6
    vec3 col = mix(sky, paper, uReveal);
    col = mix(col, col * 0.85, exp(-4.0 * max(0.0, rd.y)));

    vec4 res = raymarch(ro, rd, col);
    res *= (1.0 - uReveal); // 云由浓转淡

    col = col * (1.0 - res.w) + res.xyz;

    col = pow(col, vec3(0.45));
    col *= 1.0 - 0.1 * length((fragCoord.xy - iResolution.xy * 0.5) / iResolution.y);
    col *= 0.9 + 0.1 * pow(16.0 * fragCoord.x * fragCoord.y * (iResolution.x - fragCoord.x) * (iResolution.y - fragCoord.y) / pow(iResolution.x * iResolution.y, 2.0), 0.3);

    gl_FragColor = vec4(col, 1.0);
}`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const msg = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(msg);
    }
    return sh;
  }

  let uTime, uReveal, uResolution;
  try {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    const aPos = gl.getAttribLocation(program, "aPos");
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    uTime = gl.getUniformLocation(program, "iTime");
    uReveal = gl.getUniformLocation(program, "uReveal");
    uResolution = gl.getUniformLocation(program, "iResolution");
  } catch (error) {
    console.warn("clouds loader: WebGL init failed", error);
    finish();
    return;
  }

  function resize() {
    const dprCap = matchMedia("(max-width: 650px)").matches ? 1.25 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    let w = canvas.clientWidth * dpr;
    let h = canvas.clientHeight * dpr;
    // 限制最长边，避免 4K/5K 高分屏下 120 步 raymarching 过重。
    const scale = Math.min(1, 2000 / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform3f(uResolution, w, h, 1.0);
    }
  }

  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const startTime = performance.now();

  function frame(now) {
    if (done) return;
    resize();
    const t = (now - startTime) / 1000;

    if (revealing) {
      if (CONFIG.reveal <= 0) revealAmount = 1;
      else revealAmount = Math.min(1, (now - revealStart) / CONFIG.reveal);
      const e = easeInOut(revealAmount);
      loader.style.opacity = String(1 - e);
      gl.uniform1f(uReveal, e);
      if (revealAmount >= 1) { finish(); return; }
    } else {
      gl.uniform1f(uReveal, 0.0);
    }

    gl.uniform1f(uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  // 资源就绪（window load + 字体），封顶避免卡死；与最短停留取较大值后开始散开。
  const resourcesReady = new Promise(resolve => {
    if (document.readyState === "complete") return resolve();
    window.addEventListener("load", resolve, { once: true });
  });
  const fontsReady = document.fonts ? document.fonts.ready.then(() => {}, () => {}) : Promise.resolve();
  const loadingDone = Promise.race([Promise.all([resourcesReady, fontsReady]), delay(CONFIG.maxWait)]);

  Promise.all([delay(CONFIG.minHold), loadingDone]).then(beginReveal);

  loader.addEventListener("click", skip);
  window.addEventListener("keydown", event => { if (event.key === "Escape") skip(); }, { once: true });
})();
