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
  // times), S/Down squats or drops through a ledge, and any other key uses whatever he's holding: the laptop
  // fires that key, the guitar fires music notes, and the brush flicks paint. Walking into a prop in About
  // swaps it for the item in his hands. Jumping into a [data-bonk] block from below presses it.
  (function () {
    var player = document.getElementById('player'), sp = document.getElementById('sprite'), sx = sp.getContext('2d');
    var hand = document.getElementById('held'), playfield = document.getElementById('playfield');
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
    var cur = '', frame = 0, ft = 0, dead = false, dropEl = null, dropUntil = 0, useUntil = 0, lastShot = 0;
    var held = 'laptop', slots = [], plats = [], floorY = 0, docW = 0, keys = {}, lastKey = -1e9, played = false, last = 0, shots = [];
    var auto = { move: 0, until: 0 };

    // Frame 7 (squat) isn't in the sheet: the stand frame with 3 art pixels cut from the torso and legs
    var squat = document.createElement('canvas');
    squat.width = 33; squat.height = 54;
    function buildSquat() {
      var c = squat.getContext('2d'), y = 9;
      c.clearRect(0, 0, 33, 54);
      [[0, 33], [39, 8], [50, 4]].forEach(function (b) { c.drawImage(active, 0, b[0], 33, b[1], 0, y, 33, b[1]); y += b[1]; });
    }

    // Things he can hold, one character per art pixel ('.' is empty). Props stand upright on the shelf in
    // About; in his hands the guitar and brush turn sideways so the neck and bristles point the way he faces.
    var PAL = {
      k: '#1B1E24', H: '#2A1F1A', p: '#C9CED6', N: '#5A3A22', F: '#EDE3C8', B: '#9E3B1B', Y: '#F2A93B',
      S: '#D8DCE2', M: '#2A1F1A', T: '#C9CED6', P: '#E65FA6', b: '#E8D2A6', A: '#A7AEB8', a: '#E3E7EC',
      R: '#2F6FD6', G: '#BFE3EA', W: '#FFFFFF'
    };
    var ART = {
      // Sunburst archtop with f-holes, like the jazz guitar from About
      guitar: [
        '.....kkk.....', '....kHHHk....', '...pkHHHkp...', '....kHHHk....', '...pkHHHkp...', '....kkNkk....',
        '.....kNk.....', '.....kFk.....', '.....kNk.....', '.....kNk.....', '.....kFk.....', '.....kNk.....',
        '.....kNk.....', '.....kFk.....', '....kkNkk....', '...kBYSYBk...', '..kBYYSYYBk..', '..kBYYSYYBk..',
        '..kBYYSYYBk..', '...kBYSYBk...', '..kBYkSkYBk..', '.kBYYkSkYYBk.', 'kBYYYkSkYYYBk', 'kBYYYYSYYYYBk',
        'kBYYYMMMYYYBk', 'kBYYYYSYYYYBk', 'kBYYYYTYYYYBk', '.kBYYYTYYYBk.', '.kBBYYYYYBBk.', '..kkBBBBBkk..',
        '....kkkkk....'
      ],
      // Round brush with pink paint on the tip
      brush: [
        '..k..', '.kPk.', '.kPk.', 'kPPPk', 'kPPPk', 'kbPbk', 'kbbbk', 'kbbbk', 'kAAAk', 'kAaAk', 'kAAAk',
        '.kRk.', '.kRk.', '.kRk.', '.kRk.', '.kRk.', '.kRk.', '.kRk.', '.kRk.', '.kRk.', '.kRk.', '..k..'
      ],
      // The brush on the shelf stands in a water jar
      jar: [
        '.kkkkkkk.', '.kGGRGGk.', '.kWGRGGk.', '.kWGGGGk.', '.kGGGGGk.', '.kGGGGGk.', '..kkkkk..'
      ]
    };
    function sheetFor(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function paint(c, rows, dx, dy) {
      var x = c.getContext('2d');
      rows.forEach(function (row, y) {
        for (var i = 0; i < row.length; i++) if (row[i] !== '.') { x.fillStyle = PAL[row[i]]; x.fillRect(dx + i, dy + y, 1, 1); }
      });
      return c;
    }
    function rows(name) { var a = ART[name]; return sheetFor(a[0].length, a.length); }
    // Dark gray laptop in three-quarter view from behind: the back of the lid leans away, the base peeks out below
    function laptop() {
      var c = sheetFor(18, 14), x = c.getContext('2d');
      function px(X, Y, col) { x.fillStyle = col; x.fillRect(X, Y, 1, 1); }
      for (var y = 0; y < 12; y++) {
        var off = Math.round((11 - y) * 3 / 11), l = 3 + off, r = 14 + off;
        for (var X = l; X <= r; X++) px(X, y, (X === l || X === r || y === 0 || y === 11) ? '#1B1E24' : X === l + 1 ? '#5A5F6A' : '#3A3D44');
      }
      px(10, 5, '#8A909B'); px(11, 5, '#8A909B'); px(10, 6, '#8A909B'); px(11, 6, '#8A909B');
      for (var bx = 1; bx < 16; bx++) { px(bx, 12, '#4A4E57'); px(bx, 13, '#1B1E24'); }
      return c;
    }
    function sideways(src) {   // a quarter turn clockwise: the top of the art points forward
      var c = sheetFor(src.height, src.width), x = c.getContext('2d');
      x.translate(src.height, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0);
      return c;
    }
    var PROP = {}, HELD = {};
    PROP.laptop = HELD.laptop = laptop();
    PROP.guitar = paint(rows('guitar'), ART.guitar, 0, 0);
    HELD.guitar = sideways(PROP.guitar);
    var brush = paint(rows('brush'), ART.brush, 0, 0);
    HELD.brush = sideways(brush);
    PROP.brush = paint(paint(sheetFor(9, 21), ART.brush.slice(0, 14), 2, 0), ART.jar, 0, 14);

    function draw(c, art) {   // the canvas keeps the art's native size; CSS scales it by whole pixels
      c.width = art.width; c.height = art.height;
      c.style.setProperty('--iw', art.width); c.style.setProperty('--ih', art.height);
      c.getContext('2d').drawImage(art, 0, 0);
    }
    function hold(item) { held = item; hand.dataset.item = item; draw(hand, HELD[item]); }
    hold('laptop');

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

    // Ledges: every [data-platform] block, plus the small things he can hop between (buttons, chips, labels,
    // links) and each line of text, so there is always a way back up the page
    var LEDGES = '.btn, .chips li, .hud, .controls kbd, .site-nav a, .brand, .icon-btn, .logo-tile, .app-icon, .store-badge, ' +
      '.client-card__level, .project__role, .maps__role, .timeline__dates, .section__note, .site-footer__links a, .about__hint';
    var TEXT = 'h1, h2, h3, p:not(.controls):not(.about__hint):not(.section__note), .client-card__desc';
    function ledge(el, r, key) {
      return { el: el, key: key, top: r.top + scrollY, l: r.left + scrollX, r: r.right + scrollX, b: r.bottom + scrollY };
    }
    function lines(el) {   // one ledge per rendered line of text
      var range = document.createRange(), out = [];
      range.selectNodeContents(el);
      Array.prototype.forEach.call(range.getClientRects(), function (r) {
        if (r.width < 4) return;
        var line = out.filter(function (o) { return Math.abs(o.top - r.top) < 4; })[0];
        if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); }
        else out.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      });
      return out;
    }
    function scan() {
      W = sp.offsetWidth; H = sp.offsetHeight;
      plats = [];
      Array.prototype.forEach.call(document.querySelectorAll('[data-platform], ' + LEDGES), function (el, i) {
        var r = el.getBoundingClientRect(), p = ledge(el, r, 'b' + i);
        if (el.dataset.platform === 'bottom') p.top = r.bottom + scrollY;
        if (r.width > 0) plats.push(p);
      });
      Array.prototype.forEach.call(document.querySelectorAll(TEXT), function (el, i) {
        if (el.closest('.playfield, .ai-panel, .scene')) return;
        lines(el).forEach(function (r, j) { plats.push(ledge(el, r, 't' + i + '.' + j)); });
      });
      slots = Array.prototype.map.call(document.querySelectorAll('.props__slot'), function (el, i) {
        var r = el.getBoundingClientRect(), old = slots[i] || {};
        return { el: el, prop: el.firstElementChild, touch: old.touch, l: r.left + scrollX, r: r.right + scrollX, top: r.top + scrollY, b: r.bottom + scrollY };
      });
      floorY = root.scrollHeight; docW = root.clientWidth;
      home = plats.filter(function (p) { return p.el.classList.contains('scene'); })[0];
      if (ground && ground !== 'floor') ground = plats.filter(function (p) { return p.key === ground.key; })[0] || null;
    }
    function spawn() { scan(); fx = home.l + W / 2 + 6; fy = home.top; ground = home; vy = 0; jumps = 0; place(); }

    function bump(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
    function jump() {
      if (dead) return;
      if (ground) { vy = -JUMP; ground = null; jumps = 1; }
      else if (jumps < 3) { vy = -AIR_JUMP; jumps++; }   // triple jump: one from the ground, two in the air
    }
    // Walking into a prop trades it for whatever he's holding, which is left standing in its spot
    function swap(slot, now) {
      var item = slot.prop.dataset.item;
      if (item === held) return;
      slot.prop.dataset.item = held; draw(slot.prop, PROP[held]); bump(slot.prop, 'is-bumped');
      hold(item); useUntil = now + 900;
    }
    function touchProps(now) {
      slots.forEach(function (s) {
        var touch = fx + W * .25 > s.l && fx - W * .25 < s.r && fy > s.top && fy - H < s.b;
        if (touch && !s.touch) swap(s, now);   // only on the way in, so he doesn't swap right back
        s.touch = touch;
      });
    }
    function die() { if (!dead) { dead = true; play('die'); } }

    // Shots are tiny bitmaps with a 1px drop shadow, scaled up in CSS by whole pixels
    function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    function stamp(on, w, h, fill, kind, flat) {
      var c = sheetFor(w, h), cx = c.getContext('2d'), d = cx.createImageData(w, h), ink = hex(css('--panel-line'));
      fill = hex(fill);
      for (var i = 0; i < on.length; i++) {
        var shadow = !flat && !on[i] && i % w > 0 && i >= w && on[i - w - 1], col = on[i] ? fill : shadow ? ink : null;
        if (col) { d.data[i * 4] = col[0]; d.data[i * 4 + 1] = col[1]; d.data[i * 4 + 2] = col[2]; d.data[i * 4 + 3] = 255; }
      }
      cx.putImageData(d, 0, 0);
      c.className = 'shot shot--' + kind;
      c.style.setProperty('--iw', w); c.style.setProperty('--ih', h);
      return c;
    }
    // The key you pressed in Silkscreen, a true pixel font: at 16px each font pixel is 2x2, so sample one per
    // cell to get the native bitmap
    function glyph(text) {
      var big = document.createElement('canvas'), bx = big.getContext('2d'), font = '16px Silkscreen, monospace';
      bx.font = font; big.width = Math.ceil(bx.measureText(text).width / 2) * 2 + 4; big.height = 24;
      bx.font = font; bx.textBaseline = 'top'; bx.fillText(text, 0, 4);
      var src = bx.getImageData(0, 0, big.width, big.height).data, w = big.width / 2 + 1, h = big.height / 2 + 1, on = [];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var sx2 = x * 2 + 1, sy2 = y * 2 + 1;
        on[y * w + x] = sx2 < big.width && sy2 < big.height && src[(sy2 * big.width + sx2) * 4 + 3] > 127;
      }
      return stamp(on, w, h, css('--green'), 'code');
    }
    var SHAPES = {
      note: ['...##..', '...###.', '...#.##', '...#..#', '...#...', '...#...', '.###...', '####...', '####...', '.##....'],
      notes: ['...######', '...######', '...#....#', '...#....#', '...#....#', '.###..###', '####.####', '####.####', '.##...##.'],
      drop: ['..#..', '.###.', '.###.', '#####', '#####', '#####', '.###.'],
      splat: ['.#..#..', '.#####.', '#######']
    };
    function shape(name, fill, kind, flat) {
      var a = SHAPES[name], w = a[0].length + 1, h = a.length + 1, on = [];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) on[y * w + x] = !!a[y] && a[y][x] === '#';
      return stamp(on, w, h, fill, kind, flat);
    }
    var PAINT = ['#E65FA6', '#F2A93B', '#2F6FD6', '#3BCE9A'];
    function shoot(now, key) {
      if (dead || now - lastShot < 90) return;
      lastShot = now; useUntil = now + 900;
      var x = fx + dir * (W / 2 + 10), y = fy - H * .5, s;
      if (held === 'guitar') {   // plain black notes (white in dark mode) bob along like a melody
        s = { el: shape(Math.random() < .5 ? 'note' : 'notes', css('--ink'), 'note', true), vx: SHOT_SPEED * .8, vy: -30, g: 0, wave: 10 };
      } else if (held === 'brush') {   // paint flicks up and arcs down, then splats on whatever it lands on
        var fill = PAINT[Math.floor(Math.random() * PAINT.length)];
        s = { el: shape('drop', fill, 'paint'), fill: fill, vx: SHOT_SPEED * (.8 + Math.random() * .5), vy: -420 - Math.random() * 200, g: 1500, wave: 0 };
      } else {
        s = { el: glyph(key), vx: SHOT_SPEED, vy: 0, g: 0, wave: 0 };
      }
      s.x = x; s.y = y; s.vx *= dir; s.t = 0; s.w = 0;
      playfield.appendChild(s.el);
      shots.push(s);
    }
    function splat(s, top) {
      var el = shape('splat', s.fill, 'splat');
      playfield.appendChild(el);
      el.style.setProperty('--sx', Math.round(s.cx - el.width * 2) + 'px');
      el.style.setProperty('--sy', Math.round(top - (el.height - 1) * 4) + 'px');
      el.addEventListener('animationend', function () { el.remove(); });
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
          if (ground !== 'floor' && !keys.downHeld) { dropEl = ground.top; dropUntil = now + 260; ground = null; vy = 60; jumps = 1; }
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
            if (now < dropUntil && Math.abs(p.top - dropEl) < 6) return;   // drop through everything at that height
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
      player.classList.toggle('is-using', now < useUntil);
      if (!dead) touchProps(now);
      place();

      shots = shots.filter(function (s) {
        var py = s.y;
        s.t += dt; s.x += s.vx * dt; s.vy += s.g * dt; s.y += s.vy * dt;
        if (!s.w) { s.w = s.el.offsetWidth; s.h = s.el.offsetHeight; }
        var y = Math.round(s.y + Math.sin(s.t * 9) * s.wave), left = s.vx > 0 ? s.x : s.x - s.w;
        var tip = s.vx > 0 ? s.x + s.w : s.x, target = null, land = null;
        s.cx = left + s.w / 2;
        plats.forEach(function (p) {
          if (p.el.matches(TARGETS) && tip > p.l && tip < p.r && y > p.top && y < p.b) target = p.el;
          if (s.g && s.vy > 0 && py + s.h <= p.top && s.y + s.h >= p.top && s.cx > p.l && s.cx < p.r && (!land || p.top < land.top)) land = p;
        });
        if (target || land || s.t > SHOT_LIFE || tip < 0 || tip > docW || s.y > floorY) {
          if (target) bump(target, 'is-hit');
          if (land && !target) splat(s, land.top);
          s.el.remove();
          return false;
        }
        s.el.style.transform = 'translate(' + Math.round(left) + 'px,' + y + 'px)';
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

    // Mouse: hover hops, click knocks him out. Touch: a tap does one or the other at random.
    var tapType = 'mouse';
    sp.addEventListener('pointerdown', function (e) { tapType = e.pointerType; });
    sp.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && ground) jump(); });
    sp.addEventListener('click', function () {
      if (tapType !== 'mouse' && Math.random() < .5) { if (ground) jump(); }
      else die();
    });

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

    Array.prototype.forEach.call(document.querySelectorAll('.prop'), function (c) {
      draw(c, PROP[c.dataset.item]);
      c.addEventListener('click', function () {   // or click one to toss it to him
        var slot = slots.filter(function (s) { return s.prop === c; })[0];
        if (slot && !dead) swap(slot, performance.now());
      });
    });

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
