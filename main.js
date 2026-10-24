(function () {
  var btn = document.getElementById('theme-toggle');
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() { try { return localStorage.getItem('alx-theme'); } catch (e) { return null; } }
  function apply(dark) {
    var t = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    var label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }
  apply(document.documentElement.getAttribute('data-theme') === 'dark');
  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { if (!saved()) apply(e.matches); });
  btn.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    try { localStorage.setItem('alx-theme', dark ? 'dark' : 'light'); } catch (e) {}
    apply(dark);
  });

  var header = document.getElementById('alx-header');
  var menuBtn = document.getElementById('menu-toggle');
  function setMenu(open) {
    header.setAttribute('data-menu', open ? 'open' : 'closed');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuBtn.addEventListener('click', function () { setMenu(header.getAttribute('data-menu') !== 'open'); });
  document.getElementById('alx-nav').addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && header.getAttribute('data-menu') === 'open') { setMenu(false); menuBtn.focus(); }
  });

  function startDye() {
    var canvas = document.getElementById('alx-dye-gl');
    var gl = canvas && (canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false }) || canvas.getContext('experimental-webgl'));
    if (!gl) { if (canvas) canvas.style.display = 'none'; return; }
    var vs = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
    var fs = [
      'precision mediump float;',
      'uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uEnergy; uniform vec3 uRip[8]; uniform float uDark;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
      'float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; } return v; }',
      'vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / uRes; float asp = uRes.x / uRes.y; vec2 p = vec2(uv.x * asp, uv.y);',
      '  vec2 m = vec2(uMouse.x * asp, uMouse.y);',
      '  for (int i = 0; i < 8; i++) { vec3 r = uRip[i]; float age = uTime - r.z;',
      '    if (age > 0.0 && age < 4.0) { vec2 d = p - vec2(r.x * asp, r.y); float dist = length(d);',
      '      p += normalize(d + 1e-4) * sin(dist * 26.0 - age * 6.0) * exp(-age * 1.1) * exp(-dist * 3.0) * 0.006; } }',
      '  vec2 d = p - m; float ang = uEnergy * exp(-length(d) * 2.6); float cs = cos(ang), sn = sin(ang); p = m + mat2(cs, -sn, sn, cs) * d;',
      '  float t = uTime * 0.049;',
      '  vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 + vec2(5.2, 1.3) - t));',
      '  vec2 w = vec2(fbm(p * 1.6 + 3.0 * q + vec2(1.7, 9.2) + t * 1.3), fbm(p * 1.6 + 3.0 * q + vec2(8.3, 2.8) - t));',
      '  vec2 pc = p - vec2(0.5 * asp, 0.55); float spiral = atan(pc.y, pc.x) / 6.2831 + length(pc) * 1.4 + 2.2 * w.x + t * 0.6;',
      '  float h = fract(spiral * 2.0);',
      '  vec3 col = mix(hsv(h, 0.38, 1.0), hsv(fract(h + 0.35), 0.32, 1.0), smoothstep(0.4, 0.9, w.y) * 0.5);',
      '  col *= mix(1.0, 0.8, uDark);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');
    function sh(type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.style.display = 'none'; return; }
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['uRes', 'uTime', 'uMouse', 'uEnergy', 'uDark'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    var uRip = gl.getUniformLocation(prog, 'uRip');
    var rip = new Float32Array(24); for (var k = 0; k < 8; k++) rip[k * 3 + 2] = -99;
    var ripI = 0, mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5, energy = 0, lastX = null, lastY = null, lastRx = -999, lastRy = -999;
    var t0 = performance.now();
    var scale = 0.5;
    function resize() {
      var w = Math.max(1, Math.round(canvas.clientWidth * scale)), h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    }
    function draw(now) {
      resize();
      var t = (now - t0) / 1000;
      energy *= 0.965;
      mx += (tmx - mx) * 0.08; my += (tmy - my) * 0.08;
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform2f(U.uMouse, mx, my);
      gl.uniform1f(U.uEnergy, energy);
      gl.uniform1f(U.uDark, (document.documentElement.getAttribute('data-theme') === 'dark') ? 1 : 0);
      gl.uniform3fv(uRip, rip);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { draw(t0 + 20000); window.addEventListener('resize', function () { draw(t0 + 20000); }); new MutationObserver(function () { draw(t0 + 20000); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); return; }
    var onMove = function (e) {
      var w = window.innerWidth, h = window.innerHeight;
      tmx = e.clientX / w; tmy = 1 - e.clientY / h;
      if (lastX !== null) energy = Math.min(0.35, energy + Math.hypot(e.clientX - lastX, e.clientY - lastY) * 0.0008);
      lastX = e.clientX; lastY = e.clientY;
      if (Math.hypot(e.clientX - lastRx, e.clientY - lastRy) > 60) {
        lastRx = e.clientX; lastRy = e.clientY;
        rip[ripI * 3] = tmx; rip[ripI * 3 + 1] = tmy; rip[ripI * 3 + 2] = (performance.now() - t0) / 1000;
        ripI = (ripI + 1) % 8;
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    var loop = function (now) { draw(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  var photo = document.querySelector('.then-now');
  var photoBtn = document.getElementById('then-now-toggle');
  photoBtn.addEventListener('click', function () {
    var now = photo.getAttribute('data-show') !== 'now';
    photo.setAttribute('data-show', now ? 'now' : 'then');
    photoBtn.setAttribute('aria-checked', now ? 'true' : 'false');
  });

  startDye();
})();
