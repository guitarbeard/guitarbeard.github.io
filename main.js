(function () {
  var root = document.documentElement;
  var css = function (name) { return getComputedStyle(root).getPropertyValue(name).trim(); };

  // Theme toggle: remembers an explicit choice, otherwise follows the system
  var btn = document.getElementById('theme-toggle');
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() { try { return localStorage.getItem('alx-theme'); } catch (e) { return null; } }
  function apply(dark) {
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    var label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }
  apply(root.getAttribute('data-theme') === 'dark');
  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) { if (!saved()) apply(e.matches); });
  btn.addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') !== 'dark';
    try { localStorage.setItem('alx-theme', dark ? 'dark' : 'light'); } catch (e) {}
    apply(dark);
  });

  // Mobile menu
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

  // Then/Now photo switch. Also tells pixel Alex which era to dress for.
  var era = document.getElementById('then-now-toggle');
  var photo = document.querySelector('.then-now');
  era.addEventListener('click', function () {
    var now = era.getAttribute('aria-checked') !== 'true';
    era.setAttribute('aria-checked', now ? 'true' : 'false');
    era.setAttribute('aria-label', now ? 'Show earlier photo' : 'Show current photo');
    photo.setAttribute('data-show', now ? 'now' : 'then');
    // Only the photo on show is read out
    photo.querySelector('.then-now__then').setAttribute('aria-hidden', now ? 'true' : 'false');
    photo.querySelector('.then-now__now').setAttribute('aria-hidden', now ? 'false' : 'true');
    document.dispatchEvent(new CustomEvent('alx:era', { detail: now ? 'now' : 'then' }));
  });

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Background: a pixel grid. Squares shift in whole 2px steps away from the cursor.
  (function () {
    var cv = document.getElementById('pixel-grid'), ctx = cv.getContext('2d');
    var S = 18, R = 170, PUSH = 8, W, H, cols, rows, ox, oy, mx = -9999, my = -9999, raf = 0, ca, cb, al;
    function colors() { ca = css('--dot-a'); cb = css('--dot-b'); al = parseFloat(css('--dot-alpha')) || .15; }
    // A slow wave across the page sets each square's size
    function wave(x, y) { return .5 + .25 * Math.sin(x * .004 + 1.3) * Math.cos(y * .005 - .4) + .25 * Math.sin((x + y) * .0027 + 2.1); }
    function size() {
      var dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / S) + 1; rows = Math.ceil(H / S) + 1;
      ox = new Float32Array(cols * rows); oy = new Float32Array(cols * rows);
      colors(); draw(false);
    }
    function draw(step) {
      ctx.clearRect(0, 0, W, H);
      var moving = false, A = new Path2D(), B = new Path2D();
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
        var k = j * cols + i, x = i * S, y = j * S;
        if (step) {
          var dx = x - mx, dy = y - my, d = Math.sqrt(dx * dx + dy * dy), tx = 0, ty = 0;
          if (d < R && d > .01) { var f = 1 - d / R; f *= f * PUSH; tx = dx / d * f; ty = dy / d * f; }
          ox[k] += (tx - ox[k]) * .15; oy[k] += (ty - oy[k]) * .15;
          if (Math.abs(tx - ox[k]) > .05 || Math.abs(ty - oy[k]) > .05) moving = true;
        }
        var w = wave(x, y), s = w > .62 ? 6 : w > .42 ? 4 : 2;
        var X = Math.round((x + ox[k]) / 2) * 2, Y = Math.round((y + oy[k]) / 2) * 2;
        ((i + j) % 3 ? A : B).rect(X - s / 2, Y - s / 2, s, s);
      }
      ctx.fillStyle = 'rgba(' + ca + ',' + al + ')'; ctx.fill(A);
      ctx.fillStyle = 'rgba(' + cb + ',' + al + ')'; ctx.fill(B);
      return moving;
    }
    function loop() { raf = draw(true) ? requestAnimationFrame(loop) : 0; }
    function kick() { if (!raf && !reduce) raf = requestAnimationFrame(loop); }
    addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { mx = e.clientX; my = e.clientY; kick(); } }, { passive: true });
    document.addEventListener('pointerleave', function () { mx = my = -9999; kick(); });
    addEventListener('resize', size);
    function retheme() { colors(); draw(false); }
    new MutationObserver(retheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    size();
  })();

  // Pixel Alex, playable across the whole page. Every [data-platform] element is a one-way ledge (its top
  // edge, or its bottom edge for data-platform="bottom"). Arrows/WASD move, Space/W/Up jumps (up to three
  // times), S/Down squats or drops through a ledge, and any other key types on the laptop and fires that key.
  // Jumping into a [data-bonk] block from below presses it.
  (function () {
    var player = document.getElementById('player'), sp = document.getElementById('sprite'), sx = sp.getContext('2d');
    var lap = document.getElementById('laptop'), playfield = document.getElementById('playfield');
    var sheet = new Image(), sheets = {}, active = null;
    var ANIMS = {
      stop: { frames: [0] },
      run: { frames: [1, 2], fps: 8, loop: true },
      jump: { frames: [3] },
      fall: { frames: [4] },
      die: { frames: [5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 6, 5, 5, 5], fps: 15 },
      squat: { frames: [7] }
    };
    // Shots move a little faster than he runs
    var SPEED = 280, GRAVITY = 2300, JUMP = 900, AIR_JUMP = 780, SHOT_SPEED = 360, SHOT_LIFE = 2.2;
    var TARGETS = '.client-card, .project, .tool, .timeline__item';
    var W = 99, H = 162, fx = 0, fy = 0, vy = 0, dir = 1, ground = null, jumps = 0, home = null;
    var cur = '', frame = 0, ft = 0, dead = false, dropEl = null, dropUntil = 0, lapUntil = 0, lastShot = 0;
    var plats = [], floorY = 0, docW = 0, keys = {}, lastKey = -1e9, played = false, last = 0, shots = [];
    var auto = { move: 0, until: 0 };

    // Frame 7 (squat) isn't in the sheet: the stand frame with 3 art pixels cut from the torso and legs
    var squat = document.createElement('canvas');
    squat.width = 33; squat.height = 54;
    function buildSquat() {
      var c = squat.getContext('2d'), y = 9;
      c.clearRect(0, 0, 33, 54);
      [[0, 33], [39, 8], [50, 4]].forEach(function (b) { c.drawImage(active, 0, b[0], 33, b[1], 0, y, 33, b[1]); y += b[1]; });
    }

    // Dark gray laptop in three-quarter view from behind: the back of the lid leans away, the base peeks out below
    (function drawLaptop() {
      var c = lap.getContext('2d');
      function px(x, y, col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
      for (var y = 0; y < 12; y++) {
        var off = Math.round((11 - y) * 3 / 11), l = 3 + off, r = 14 + off;
        for (var x = l; x <= r; x++) px(x, y, (x === l || x === r || y === 0 || y === 11) ? '#1B1E24' : x === l + 1 ? '#5A5F6A' : '#3A3D44');
      }
      px(10, 5, '#8A909B'); px(11, 5, '#8A909B'); px(10, 6, '#8A909B'); px(11, 6, '#8A909B');
      for (var bx = 1; bx < 16; bx++) { px(bx, 12, '#4A4E57'); px(bx, 13, '#1B1E24'); }
    })();

    function show(f) {
      sx.clearRect(0, 0, 33, 54);
      if (f === 7) sx.drawImage(squat, 0, 0);
      else sx.drawImage(active, f * 33, 0, 33, 54, 0, 0, 33, 54);
    }
    function play(name) { if (cur === name) return; cur = name; frame = 0; ft = 0; show(ANIMS[name].frames[0]); }
    function place() {
      var unit = W / 33;   // one art pixel, so he moves on his own pixel grid
      player.style.setProperty('--x', Math.round((fx - W / 2) / unit) * unit + 'px');
      player.style.setProperty('--y', Math.round((fy - H) / unit) * unit + 'px');
      player.style.setProperty('--dir', dir);
    }

    function scan() {
      W = sp.offsetWidth; H = sp.offsetHeight;
      plats = Array.prototype.map.call(document.querySelectorAll('[data-platform]'), function (el) {
        var r = el.getBoundingClientRect();
        return { el: el, top: (el.dataset.platform === 'bottom' ? r.bottom : r.top) + scrollY, l: r.left + scrollX, r: r.right + scrollX, b: r.bottom + scrollY };
      }).filter(function (p) { return p.r > p.l; });
      floorY = root.scrollHeight; docW = root.clientWidth;
      home = plats.filter(function (p) { return p.el.classList.contains('scene'); })[0];
      if (ground && ground !== 'floor') ground = plats.filter(function (p) { return p.el === ground.el; })[0] || null;
    }
    function spawn() { scan(); fx = home.l + W / 2 + 6; fy = home.top; ground = home; vy = 0; jumps = 0; place(); }

    function bump(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
    function jump() {
      if (dead) return;
      if (ground) { vy = -JUMP; ground = null; jumps = 1; }
      else if (jumps < 3) { vy = -AIR_JUMP; jumps++; }   // triple jump: one from the ground, two in the air
    }
    function die() { if (!dead) { dead = true; play('die'); } }

    // The key you pressed in Silkscreen, a true pixel font: at 16px each font pixel is 2x2, so sample one per
    // cell to get the native bitmap, add a 1px drop shadow, and show it at 6x
    function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    function glyph(text) {
      var big = document.createElement('canvas'), bx = big.getContext('2d'), font = '16px Silkscreen, monospace';
      bx.font = font; big.width = Math.ceil(bx.measureText(text).width / 2) * 2 + 4; big.height = 24;
      bx.font = font; bx.textBaseline = 'top'; bx.fillText(text, 0, 4);
      var src = bx.getImageData(0, 0, big.width, big.height).data, w = big.width / 2 + 1, h = big.height / 2 + 1, on = [];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var sx2 = x * 2 + 1, sy2 = y * 2 + 1;
        on[y * w + x] = sx2 < big.width && sy2 < big.height && src[(sy2 * big.width + sx2) * 4 + 3] > 127;
      }
      var c = document.createElement('canvas'), cx = c.getContext('2d');
      c.width = w; c.height = h;
      var d = cx.createImageData(w, h), ink = hex(css('--panel-line')), fill = hex(css('--green'));
      for (var i = 0; i < on.length; i++) {
        var shadow = !on[i] && i % w > 0 && i >= w && on[i - w - 1], col = on[i] ? fill : shadow ? ink : null;
        if (col) { d.data[i * 4] = col[0]; d.data[i * 4 + 1] = col[1]; d.data[i * 4 + 2] = col[2]; d.data[i * 4 + 3] = 255; }
      }
      cx.putImageData(d, 0, 0);
      c.className = 'code-shot';
      c.style.width = w * 6 + 'px'; c.style.height = h * 6 + 'px';
      return c;
    }
    function shoot(now, text) {
      if (dead || now - lastShot < 90) return;
      lastShot = now; lapUntil = now + 900;
      var s = glyph(text);
      playfield.appendChild(s);
      shots.push({ el: s, x: fx + dir * (W / 2 + 10), y: fy - H * .5, v: dir * SHOT_SPEED, t: 0, w: 0 });
    }

    // Wander on the home ledge when nobody is playing
    function think(now) {
      if (now < auto.until) return;
      var r = Math.random();
      auto.move = r < .25 ? -1 : r < .5 ? 1 : 0;
      if (r > .88) jump(); else if (!auto.move && Math.random() < .5) dir = -dir;
      auto.until = now + (auto.move ? 600 + Math.random() * 700 : 1400 + Math.random() * 1800);
    }

    function step(now) {
      var dt = Math.min((now - (last || now)) / 1000, .04);
      last = now;
      var a = ANIMS[cur];
      if (a && a.fps && (ft += dt) >= 1 / a.fps) {
        ft = 0; frame++;
        if (frame >= a.frames.length) {
          if (a.loop) frame = 0;
          else { frame = a.frames.length - 1; if (cur === 'die') { dead = false; cur = ''; play('stop'); } }
        }
        if (cur) show(ANIMS[cur].frames[frame]);
      }
      if (!dead) {
        var playing = now - lastKey < 6000, move = 0, crouch = false;
        if (playing) move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        else if (!reduce && ground === home) {
          think(now); move = auto.move;
          if ((move < 0 && fx - W / 2 <= home.l + 4) || (move > 0 && fx + W / 2 >= home.r - 4)) move = auto.move = 0;
        }
        if (move) dir = move;
        if (playing && keys.down && ground) {
          if (ground !== 'floor' && !keys.downHeld) { dropEl = ground.el; dropUntil = now + 260; ground = null; vy = 60; jumps = 1; }
          else { crouch = true; move = 0; }
          keys.downHeld = true;
        }
        fx = Math.min(docW - W / 2, Math.max(W / 2, fx + move * SPEED * dt));
        if (ground && ground !== 'floor' && (fx < ground.l - 12 || fx > ground.r + 12)) { ground = null; vy = 0; jumps = 1; }
        if (!ground) {
          vy += GRAVITY * dt;
          var ny = fy + vy * dt, hit = null;
          if (ny - H < 0) { ny = H; vy = Math.max(vy, 0); }   // his head stops at the top of the page
          if (vy < 0) plats.forEach(function (p) {               // head-butt a [data-bonk] block from below
            if (!('bonk' in p.el.dataset) || fy - H < p.b - 1 || ny - H >= p.b || fx < p.l + 6 || fx > p.r - 6) return;
            ny = p.b + H; vy = 80; bump(p.el, 'is-bumped'); p.el.click();
          });
          if (vy >= 0) plats.forEach(function (p) {
            if (p.el === dropEl && now < dropUntil) return;
            if (fy <= p.top + 1 && ny >= p.top && fx >= p.l - 12 && fx <= p.r + 12 && (!hit || p.top < hit.top)) hit = p;
          });
          if (hit) { fy = hit.top; vy = 0; ground = hit; jumps = 0; }
          else if (ny >= floorY) { fy = floorY; vy = 0; ground = 'floor'; jumps = 0; }
          else fy = ny;
        }
        play(!ground ? (vy < 0 ? 'jump' : 'fall') : crouch ? 'squat' : move ? 'run' : 'stop');
        if (playing) {   // the camera follows while you play
          var top = fy - H - scrollY, bottom = fy - scrollY;
          if (top < 90) scrollTo(0, scrollY + (top - 90) * .2);
          else if (bottom > innerHeight - 40) scrollTo(0, scrollY + (bottom - innerHeight + 40) * .2);
        }
      }
      player.classList.toggle('is-coding', now < lapUntil);
      place();

      shots = shots.filter(function (s) {
        s.t += dt; s.x += s.v * dt;
        if (!s.w) s.w = s.el.offsetWidth;
        var tip = s.v > 0 ? s.x + s.w : s.x, target = null;
        plats.forEach(function (p) { if (p.el.matches(TARGETS) && tip > p.l && tip < p.r && s.y > p.top && s.y < p.b) target = p.el; });
        if (target || s.t > SHOT_LIFE || tip < 0 || tip > docW) {
          if (target) bump(target, 'is-hit');
          s.el.remove();
          return false;
        }
        s.el.style.transform = 'translate(' + Math.round(s.v > 0 ? s.x : s.x - s.w) + 'px,' + Math.round(s.y) + 'px)';
        s.el.style.opacity = Math.min(1, (SHOT_LIFE - s.t) * 4);
        return true;
      });
      requestAnimationFrame(step);
    }

    // Keyboard: only while Alex is on screen and focus isn't in a field, link, or button. Letter keys start the
    // game; Space and the arrows keep scrolling the page until then, and Escape hands them back.
    var MAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'down', KeyS: 'down' };
    var armed = false;
    function inView() { var r = sp.getBoundingClientRect(); return r.bottom > -40 && r.top < innerHeight + 40; }
    function busy(t) { return t.closest && t.closest('input, textarea, select, button, a, [contenteditable], .ai-panel'); }
    addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || busy(e.target) || !inView()) return;
      if (e.key === 'Escape') { armed = false; keys = {}; lastKey = -1e9; return; }
      var k = MAP[e.code], now = performance.now();
      if (!armed && (e.code === 'Space' || /^Arrow/.test(e.code))) return;
      if (k) { e.preventDefault(); if (k === 'jump') { if (!e.repeat) jump(); } else keys[k] = true; }
      else if (e.key.length === 1) { e.preventDefault(); shoot(now, e.key.toUpperCase()); }
      else return;
      armed = true; lastKey = now; played = true;
    });
    addEventListener('keyup', function (e) { var k = MAP[e.code]; if (k) { keys[k] = false; if (k === 'down') keys.downHeld = false; } });
    addEventListener('blur', function () { keys = {}; });
    addEventListener('resize', function () { if (played) scan(); else spawn(); });
    setInterval(scan, 1000);

    sp.addEventListener('pointerenter', function () { if (ground) jump(); });
    sp.addEventListener('click', die);

    // Both eras get a lighter skin tone, closer to the photos. "Now" Alex also gets salt-and-pepper hair and
    // beard and a navy shirt with lemons, like the Now photo. Recolored from the same sheet.
    function recolor(now) {
      var c = document.createElement('canvas'), x = c.getContext('2d');
      c.width = sheet.width; c.height = sheet.height;
      x.drawImage(sheet, 0, 0);
      var d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (var y = 0; y < c.height; y++) for (var X = 0; X < c.width; X++) {
        var i = (y * c.width + X) * 4, r = p[i], g = p[i + 1], b = p[i + 2], col = null;
        if (!p[i + 3] || Math.floor(X / 33) === 6) continue;              // skip the white hit-flash frame
        if (r === 212 && g === 163 && b === 118) col = [234, 192, 156];
        else if (!now) continue;
        else if (r === 0 && g === 0 && b === 0 && y < 30) col = [92, 94, 99];
        else if ((r === 111 && g === 23 && b === 23) || (r === 59 && g === 206 && b === 154)) {
          col = (Math.floor(X / 3) + Math.floor(y / 3) * 2) % 4 === 0 ? [242, 211, 79] : [30, 43, 87];
        }
        if (col) { p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; }
      }
      x.putImageData(d, 0, 0);
      return c;
    }
    function setEra(name) { active = sheets[name] || sheets.then; buildSquat(); if (cur) show(ANIMS[cur].frames[frame]); }
    document.addEventListener('alx:era', function (e) { setEra(e.detail); });

    function start() { spawn(); play('stop'); requestAnimationFrame(step); }
    sheet.onload = function () {
      sheets.then = recolor(false); sheets.now = recolor(true);
      setEra(photo.getAttribute('data-show') === 'now' ? 'now' : 'then');
      // Platforms move as fonts and images load, so wait for the page before placing him
      if (document.readyState === 'complete') start(); else addEventListener('load', start);
    };
    sheet.src = 'images/alxdna-sprite.png';
  })();
})();
