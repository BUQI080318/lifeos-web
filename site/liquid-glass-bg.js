/* DeepSeek-inspired Cool Liquid Glass GLSL Shader Canvas (#08090C + #204A7E + #CEC8BB warm highlight). */
(() => {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (document.getElementById('liquidGlassBg')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'liquidGlassBg';
  canvas.setAttribute('aria-hidden', 'true');

  function mountCanvas() {
    if (!document.body || canvas.isConnected) return;
    document.body.prepend(canvas);
  }
  if (document.body) mountCanvas();
  else document.addEventListener('DOMContentLoaded', mountCanvas, { once: true });

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
    || canvas.getContext('experimental-webgl', { alpha: false, antialias: false, depth: false, stencil: false });

  function startCanvas2D() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const draw = t => {
      raf = 0;
      const w = Math.max(320, Math.min(960, Math.round(window.innerWidth * 0.65)));
      const h = Math.max(240, Math.min(720, Math.round(window.innerHeight * 0.65)));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

      ctx.fillStyle = '#08090C';
      ctx.fillRect(0, 0, w, h);

      const s = t * 0.00022;
      const g1 = ctx.createRadialGradient(w * (0.28 + 0.08 * Math.sin(s)), h * (0.24 + 0.06 * Math.cos(s * 0.8)), 10, w * 0.35, h * 0.3, w * 0.82);
      g1.addColorStop(0, 'rgba(32, 74, 126, 0.78)');
      g1.addColorStop(0.55, 'rgba(32, 74, 126, 0.24)');
      g1.addColorStop(1, 'rgba(8, 9, 12, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(w * (0.76 + 0.07 * Math.cos(s * 1.1)), h * (0.18 + 0.07 * Math.sin(s * 0.7)), 8, w * 0.72, h * 0.26, w * 0.68);
      g2.addColorStop(0, 'rgba(206, 200, 187, 0.26)');
      g2.addColorStop(0.42, 'rgba(32, 74, 126, 0.32)');
      g2.addColorStop(1, 'rgba(8, 9, 12, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      const g3 = ctx.createRadialGradient(w * (0.56 - 0.06 * Math.sin(s * 0.6)), h * (0.86 + 0.05 * Math.cos(s)), 10, w * 0.55, h * 0.85, w * 0.78);
      g3.addColorStop(0, 'rgba(32, 74, 126, 0.44)');
      g3.addColorStop(0.65, 'rgba(8, 9, 12, 0)');
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, w, h);

      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw(0);
    window.addEventListener('resize', () => { if (reduce) draw(0); }, { passive: true });
    window.addEventListener('pagehide', () => { if (raf) cancelAnimationFrame(raf); });
  }

  if (!gl) {
    startCanvas2D();
    return;
  }

  const vsSrc = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fsSrc = `
    precision mediump float;
    uniform vec2 u_res;
    uniform float u_time;

    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3. - 2. * f);
      return mix(
        mix(hash(i), hash(i + vec2(1., 0.)), u.x),
        mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x),
        u.y
      );
    }

    float fbm(vec2 p){
      float v = 0.;
      float a = .5;
      mat2 rot = mat2(.8, -.6, .6, .8);
      for(int i = 0; i < 4; i++){
        v += a * noise(p);
        p = rot * p * 1.9 + vec2(1.7, 9.2);
        a *= .5;
      }
      return v;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      float aspect = u_res.x / max(1., u_res.y);
      vec2 p = (uv - .5) * vec2(aspect, 1.) * 1.35;

      float t = u_time * .065;
      float q = fbm(p + vec2(t * .4, -t * .3));
      float r = fbm(p + 1.65 * vec2(q) + vec2(-t * .25, t * .35));
      float swirl = fbm(p * 1.15 + 1.45 * r + vec2(t * .18, t * .12));

      vec3 C1 = vec3(8., 9., 12.) / 255.;
      vec3 C3 = vec3(32., 74., 126.) / 255.;
      vec3 C4 = vec3(206., 200., 187.) / 255.;

      float baseGlow = smoothstep(.18, .88, q * .55 + r * .45);
      vec3 col = mix(C1, C3, baseGlow * .92);
      col = mix(col, C3 * 1.28, smoothstep(.45, .88, r) * .35);
      col = mix(col, C4, smoothstep(.60, .85, swirl) * .55);

      float d = length(uv - .5);
      float vignette = smoothstep(.85, .28, d);
      col *= mix(1. - .38, 1., vignette);

      float grain = (hash(gl_FragCoord.xy + fract(u_time) * 100.) - .5) * .012;
      col += grain;

      gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
    }
  `;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
    return sh;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  const prog = vs && fs ? gl.createProgram() : null;
  if (!prog) { startCanvas2D(); return; }

  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { startCanvas2D(); return; }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  gl.useProgram(prog);

  function resize() {
    // Cap shader render buffer around ~1MP as noted in DeepSeek Harness teardown.
    const w = Math.max(1, window.innerWidth || 1280);
    const h = Math.max(1, window.innerHeight || 720);
    const area = w * h;
    const scale = area > 1000000 ? Math.sqrt(1000000 / area) : Math.min(1, 0.85);
    canvas.width = Math.max(320, Math.round(w * scale));
    canvas.height = Math.max(240, Math.round(h * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  let raf = 0;
  const startMs = performance.now();
  function frame(now) {
    raf = 0;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reduce ? 12.5 : (now - startMs) * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
  }
  frame(startMs);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !reduce && !raf) raf = requestAnimationFrame(frame);
  });
  window.addEventListener('pagehide', () => { if (raf) cancelAnimationFrame(raf); });
})();
