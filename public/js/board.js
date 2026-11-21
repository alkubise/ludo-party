/* Ludo Party – SVG board renderer.
 * Draws the board from the shared geometry (shared/ludo.js) in a fixed 150x150
 * viewBox (1 cell = 10 units) so proportions are identical on every screen.
 * Visual style: beveled tiles, recessed bases, glossy 3D pawns, gold medal centre. */
(function () {
  'use strict';
  var L = window.Ludo;
  var NS = 'http://www.w3.org/2000/svg';
  var STEP = 190; // ms per cell while a token walks

  var PAL = {
    red: { main: '#ef4444', dark: '#a61b1b', hi: '#ff9b9b', lane: '#f87171' },
    green: { main: '#22c55e', dark: '#117a38', hi: '#86efac', lane: '#4ade80' },
    yellow: { main: '#fbbf24', dark: '#b36b00', hi: '#fff0a0', lane: '#fcd34d' },
    blue: { main: '#3b82f6', dark: '#1a47b8', hi: '#9cc4ff', lane: '#60a5fa' }
  };

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function stops(parent, list) {
    list.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] == null ? 1 : s[2] }, parent); });
  }
  function starPoints(cx, cy, ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  function chevron(parent, cx, cy, deg, op, w) {
    return el('path', {
      d: 'M-1.5 -2L1.5 0L-1.5 2', fill: 'none', stroke: '#fff', 'stroke-width': w || 1.1,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: op,
      transform: 'translate(' + cx + ' ' + cy + ') rotate(' + deg + ')'
    }, parent);
  }
  function clone(o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = o[k].slice(); }); return r; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function Board(svg) {
    this.svg = svg;
    this.tokens = {};
    this.snap = null;
    this.epoch = 0;
    this.chain = Promise.resolve();
    this.busy = 0;
    this.k = 0;       // quarter turns (0..3) the board is rotated so the local player sits bottom-left
    this.angle = 0;   // accumulated rotation in degrees (never wraps, so it never spins backwards)
    this.onPick = this.onStep = this.onCapture = this.onFinish = this.onIdle = null;
    this.draw();
  }
  Board.PAL = PAL;

  Board.prototype.defs = function (svg) {
    var d = el('defs', null, svg), g;
    var cp = el('clipPath', { id: 'bclip' }, d);
    el('rect', { x: 0, y: 0, width: 150, height: 150, rx: 7 }, cp);
    g = el('linearGradient', { id: 'g-paper', x1: 0, y1: 0, x2: 1, y2: 1 }, d); stops(g, [[0, '#fffaf0'], [1, '#f1e4c4']]);
    g = el('linearGradient', { id: 'g-tile', x1: 0, y1: 0, x2: 0, y2: 1 }, d); stops(g, [[0, '#ffffff'], [1, '#f0e7d0']]);
    g = el('linearGradient', { id: 'g-gold', x1: 0, y1: 0, x2: 1, y2: 1 }, d); stops(g, [[0, '#fff2a8'], [0.5, '#f0b92a'], [1, '#b8800a']]);
    g = el('linearGradient', { id: 'g-gloss', x1: 0, y1: 0, x2: 0, y2: 1 }, d); stops(g, [[0, '#fff', 0.22], [1, '#fff', 0]]);
    g = el('radialGradient', { id: 'g-medal', cx: 0.4, cy: 0.35, r: 0.8 }, d); stops(g, [[0, '#fff7c2'], [0.6, '#f2bd2e'], [1, '#9a6a05']]);
    L.COLORS.forEach(function (c) {
      var p = PAL[c];
      g = el('linearGradient', { id: 'g-base-' + c, x1: 0, y1: 0, x2: 1, y2: 1 }, d); stops(g, [[0, p.hi], [0.35, p.main], [1, p.dark]]);
      g = el('linearGradient', { id: 'g-cell-' + c, x1: 0, y1: 0, x2: 0, y2: 1 }, d); stops(g, [[0, p.hi], [0.45, p.main], [1, p.dark]]);
      g = el('linearGradient', { id: 'g-lane-' + c, x1: 0, y1: 0, x2: 0, y2: 1 }, d); stops(g, [[0, p.hi], [1, p.lane]]);
      g = el('radialGradient', { id: 'g-pad-' + c, cx: 0.5, cy: 0.55, r: 0.6 }, d); stops(g, [[0, p.dark, 0.5], [0.7, p.main, 0.22], [1, p.hi, 0.3]]);
      g = el('radialGradient', { id: 'g-head-' + c, cx: 0.35, cy: 0.3, r: 0.85 }, d); stops(g, [[0, '#fff'], [0.18, p.hi], [0.55, p.main], [1, p.dark]]);
      g = el('linearGradient', { id: 'g-body-' + c, x1: 0, y1: 0, x2: 1, y2: 0 }, d); stops(g, [[0, p.hi], [0.35, p.main], [1, p.dark]]);
      g = el('linearGradient', { id: 'g-tri-' + c, x1: 0, y1: 0, x2: 1, y2: 1 }, d); stops(g, [[0, p.hi], [0.5, p.main], [1, p.dark]]);
    });
  };

  // One beveled tile: a darker "thickness" under a lit face with a glossy top edge.
  function tile(g, x, y, fill, stroke) {
    el('rect', { x: x + 0.6, y: y + 1.35, width: 8.8, height: 8.8, rx: 1.9, fill: 'rgba(60,40,0,.28)' }, g);
    el('rect', { x: x + 0.6, y: y + 0.6, width: 8.8, height: 8.8, rx: 1.9, fill: fill, stroke: stroke, 'stroke-width': 0.45 }, g);
    el('rect', { x: x + 1.5, y: y + 1.2, width: 7, height: 2.6, rx: 1.2, fill: '#fff', opacity: 0.35 }, g);
  }

  Board.prototype.draw = function () {
    var svg = this.svg;
    svg.innerHTML = '';
    this.defs(svg);
    var g = el('g', { 'clip-path': 'url(#bclip)' }, svg);
    el('rect', { x: 0, y: 0, width: 150, height: 150, fill: 'url(#g-paper)' }, g);

    // recessed home bases
    L.COLORS.forEach(function (c) {
      var o = L.BASE_ORIGIN[c], ox = o[0] * 10, oy = o[1] * 10, bg = el('g', { 'class': 'base', 'data-color': c }, g);
      el('rect', { 'class': 'base-bg', x: ox, y: oy, width: 60, height: 60, fill: 'url(#g-base-' + c + ')' }, bg);
      el('rect', { x: ox + 7, y: oy + 7.8, width: 46, height: 46, rx: 9, fill: 'rgba(0,0,0,.25)' }, bg);
      el('rect', { x: ox + 7, y: oy + 7, width: 46, height: 46, rx: 9, fill: '#fffaf0', stroke: PAL[c].dark, 'stroke-opacity': 0.35, 'stroke-width': 0.7 }, bg);
      el('rect', { x: ox + 9, y: oy + 8.6, width: 42, height: 7, rx: 5, fill: '#fff', opacity: 0.55 }, bg);
      L.BASE_SPOTS.forEach(function (s) {
        var cx = ox + s[0] * 10, cy = oy + s[1] * 10;
        el('circle', { cx: cx, cy: cy, r: 7.6, fill: 'url(#g-pad-' + c + ')', stroke: PAL[c].main, 'stroke-width': 1, 'stroke-opacity': 0.7 }, bg);
        el('circle', { cx: cx, cy: cy, r: 5.4, fill: 'none', stroke: '#fff', 'stroke-width': 0.8, opacity: 0.55 }, bg);
      });
    });

    // track tiles
    var startOf = {};
    L.COLORS.forEach(function (c) { startOf[L.START[c]] = c; });
    L.TRACK.forEach(function (cell, i) {
      var x = cell[0] * 10, y = cell[1] * 10, owner = startOf[i];
      tile(g, x, y, owner ? 'url(#g-cell-' + owner + ')' : 'url(#g-tile)', owner ? PAL[owner].dark : '#dccfae');
      if (owner) {
        var nx = L.TRACK[(i + 1) % 52];
        chevron(g, x + 5, y + 5.2, Math.atan2(nx[1] - cell[1], nx[0] - cell[0]) * 180 / Math.PI, 1, 1.6);
      } else if (L.SAFE.has(i)) {
        el('polygon', { points: starPoints(x + 5, y + 5.3, 3.7, 1.6), fill: 'url(#g-gold)', stroke: '#9a6a05', 'stroke-width': 0.35, 'stroke-linejoin': 'round' }, g);
      }
    });

    // home lanes
    var ang = { red: 0, green: 90, yellow: 180, blue: 270 };
    L.COLORS.forEach(function (c) {
      L.LANES[c].forEach(function (cell) {
        var x = cell[0] * 10, y = cell[1] * 10;
        tile(g, x, y, 'url(#g-lane-' + c + ')', PAL[c].dark);
        chevron(g, x + 5, y + 5.2, ang[c], 0.75, 1.2);
      });
    });

    // centre: four colour triangles and a gold medal
    [['red', '60,60 60,90 75,75'], ['green', '60,60 90,60 75,75'], ['yellow', '90,60 90,90 75,75'], ['blue', '60,90 90,90 75,75']].forEach(function (p) {
      el('polygon', { points: p[1], fill: 'url(#g-tri-' + p[0] + ')', stroke: '#fff8e8', 'stroke-width': 0.7, 'stroke-linejoin': 'round' }, g);
    });
    el('circle', { cx: 75, cy: 75.9, r: 4.8, fill: 'rgba(0,0,0,.3)' }, g);
    el('circle', { cx: 75, cy: 75, r: 4.8, fill: 'url(#g-medal)', stroke: '#fff8e8', 'stroke-width': 0.8 }, g);
    el('polygon', { points: starPoints(75, 75, 3.1, 1.3), fill: '#fff', opacity: 0.92 }, g);

    // board edge and a soft gloss highlight
    el('rect', { x: 0.5, y: 0.5, width: 149, height: 149, rx: 6.6, fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1 }, g);
    el('rect', { x: 0, y: 0, width: 150, height: 70, fill: 'url(#g-gloss)', 'pointer-events': 'none' }, g);

    this.gFoot = el('g', { 'class': 'foot-layer', 'pointer-events': 'none' }, svg);
    this.gDest = el('g', { 'class': 'dest-layer' }, svg);
    this.gTok = el('g', { 'class': 'tok-layer' }, svg);
    this.gFx = el('g', { 'class': 'fx-layer', 'pointer-events': 'none' }, svg);
  };

  Board.prototype.makeToken = function (c, i, pos) {
    var self = this, p = PAL[c];
    var g = el('g', { 'class': 'tok', 'data-c': c, 'data-i': i }, this.gTok);
    g.innerHTML =
      '<ellipse cx="0.5" cy="3.9" rx="4.2" ry="1.5" fill="rgba(30,20,0,.38)"/>' +
      '<g class="hop">' +
      '<ellipse cx="0" cy="3.1" rx="3.7" ry="1.5" fill="' + p.dark + '"/>' +
      '<ellipse cx="0" cy="2.6" rx="3.7" ry="1.45" fill="url(#g-body-' + c + ')" stroke="#fff" stroke-width=".45"/>' +
      '<path d="M-2.7 2.4C-2.5.5-1.4-.2-1.2-1.3L1.2-1.3C1.4-.2 2.5.5 2.7 2.4Z" fill="url(#g-body-' + c + ')" stroke="#fff" stroke-width=".4" stroke-linejoin="round"/>' +
      '<ellipse cx="0" cy="-1.3" rx="2" ry=".75" fill="' + p.dark + '" opacity=".55"/>' +
      '<circle cx="0" cy="-3" r="2.5" fill="url(#g-head-' + c + ')" stroke="#fff" stroke-width=".5"/>' +
      '<ellipse cx="-.85" cy="-3.9" rx=".85" ry=".5" fill="#fff" opacity=".85"/></g>' +
      '<circle class="ring" r="6" fill="none" stroke="#fff" stroke-width="1.1" stroke-dasharray="2 1.5"/>' +
      '<circle class="hit" r="6.6" fill="transparent"/>';
    g.addEventListener('click', function () {
      if (g.classList.contains('legal') && self.onPick) self.onPick(c, i);
    });
    return { g: g, c: c, i: i, pos: pos, hop: g.querySelector('.hop') };
  };

  Board.prototype.build = function (snap) {
    this.epoch++;
    this.tokens = {};
    this.gTok.innerHTML = ''; this.gDest.innerHTML = ''; this.gFx.innerHTML = ''; this.gFoot.innerHTML = '';
    var self = this;
    Object.keys(snap).forEach(function (c) {
      for (var i = 0; i < 4; i++) self.tokens[c + i] = self.makeToken(c, i, snap[c][i]);
    });
    this.svg.querySelectorAll('.base').forEach(function (b) {
      b.classList.toggle('empty', !snap[b.getAttribute('data-color')]);
    });
    this.svg.classList.add('notrans');
    this.layout();
    this.svg.getBoundingClientRect(); // flush so the first placement does not animate
    this.svg.classList.remove('notrans');
  };

  // Rotates the whole board so the local player's corner is always bottom-left.
  Board.prototype.setRotation = function (k, animate) {
    var delta = (k - this.k + 4) % 4;
    if (delta === 3) delta = -1;
    this.k = k;
    this.angle += delta * 90;
    var svg = this.svg, self = this;
    svg.style.transition = animate && delta ? 'transform .7s cubic-bezier(.4,0,.2,1)' : 'none';
    svg.style.transform = 'rotate(' + this.angle + 'deg)';
    if (animate && delta) {
      svg.classList.add('rotating');
      setTimeout(function () { svg.classList.remove('rotating'); }, 750);
    }
    this.layout();
  };

  var OFFS = {
    2: [[-2.3, 0], [2.3, 0]],
    3: [[-2.4, -1.5], [2.4, -1.5], [0, 2.3]],
    4: [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]
  };

  Board.prototype.layout = function () {
    var groups = {}, self = this;
    Object.keys(this.tokens).forEach(function (k) {
      var t = self.tokens[k];
      t.xy = L.coord(t.c, t.pos, t.i);
      t.dx = 0; t.dy = 0; t.sc = t.pos === L.FINISH ? 0.62 : 1.1;
      if (t.pos > -1 && t.pos < L.FINISH) {
        var key = t.xy[0].toFixed(2) + ',' + t.xy[1].toFixed(2);
        (groups[key] = groups[key] || []).push(t);
      }
    });
    Object.keys(groups).forEach(function (key) {
      var arr = groups[key], n = Math.min(arr.length, 4);
      if (n < 2) return;
      arr.forEach(function (t, idx) {
        var o = OFFS[n][Math.min(idx, 3)];
        t.dx = o[0]; t.dy = o[1]; t.sc = 0.8;
      });
    });
    Object.keys(this.tokens).forEach(function (k) {
      var t = self.tokens[k];
      // pawns are counter-rotated so they always stand upright on screen
      t.g.style.transform = 'translate(' + (t.xy[0] * 10 + t.dx).toFixed(2) + 'px,' + (t.xy[1] * 10 + t.dy).toFixed(2) + 'px) scale(' + t.sc + ') rotate(' + (-self.angle) + 'deg)';
    });
  };

  Board.prototype.raise = function (t) {
    this.gTok.appendChild(t.g);
    t.g.getBoundingClientRect(); // keep the CSS transition working after re-insertion
  };

  Board.prototype.hop = function (t) {
    if (t.hop && t.hop.animate) {
      t.hop.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-3.6px)' }, { transform: 'translateY(0)' }], { duration: STEP - 30, easing: 'ease-out' });
    }
  };

  Board.prototype.foot = function (xy, c) {
    var dot = el('circle', { cx: xy[0] * 10, cy: xy[1] * 10, r: 1.5, fill: PAL[c].main, 'class': 'foot' }, this.gFoot);
    setTimeout(function () { if (dot.parentNode) dot.parentNode.removeChild(dot); }, 1300);
  };

  Board.prototype.burst = function (xy, c, gold) {
    var col = gold ? '#ffd34d' : PAL[c].main, k, s;
    for (k = 0; k < 2; k++) {
      var ring = el('circle', { cx: xy[0] * 10, cy: xy[1] * 10, r: 3, fill: 'none', stroke: col, 'stroke-width': 1.6, 'class': 'burst' }, this.gFx);
      ring.style.animationDelay = (k * 0.12) + 's';
      (function (r) { setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 800); })(ring);
    }
    var n = gold ? 10 : 6;
    for (s = 0; s < n; s++) {
      var a = s * 2 * Math.PI / n, spark = el('circle', { cx: xy[0] * 10, cy: xy[1] * 10, r: gold ? 1.3 : 1.1, fill: gold ? '#fff2a8' : '#fff', 'class': 'spark' }, this.gFx);
      spark.style.setProperty('--sx', (Math.cos(a) * (gold ? 10 : 7)).toFixed(1) + 'px');
      spark.style.setProperty('--sy', (Math.sin(a) * (gold ? 10 : 7)).toFixed(1) + 'px');
      (function (r) { setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 700); })(spark);
    }
  };

  // Diff-based update: animates token movement towards the new server state.
  Board.prototype.update = function (snap, reset) {
    var newKeys = Object.keys(snap).sort().join(), oldKeys = this.snap ? Object.keys(this.snap).sort().join() : null;
    if (reset || !this.snap || newKeys !== oldKeys) {
      this.snap = clone(snap);
      this.build(snap);
      return;
    }
    var prev = this.snap, movers = [], caps = [];
    this.snap = clone(snap);
    Object.keys(snap).forEach(function (c) {
      snap[c].forEach(function (b, i) {
        var a = prev[c][i];
        if (a === b) return;
        if (b === -1) caps.push({ c: c, i: i, from: a });
        else movers.push({ c: c, i: i, from: a, to: b });
      });
    });
    if (!movers.length && !caps.length) return;
    var self = this, ep = this.epoch;
    this.busy++;
    this.chain = this.chain.then(async function () {
      for (var m = 0; m < movers.length; m++) {
        var mv = movers[m], t = self.tokens[mv.c + mv.i];
        if (!t || ep !== self.epoch) return;
        self.raise(t);
        var steps = [];
        if (mv.from === -1) steps.push(mv.to);
        else for (var p = mv.from + 1; p <= mv.to; p++) steps.push(p);
        for (var s = 0; s < steps.length; s++) {
          if (ep !== self.epoch) return;
          if (t.pos >= 0 && t.pos < L.FINISH) self.foot(L.coord(t.c, t.pos, t.i), t.c);
          t.pos = steps[s];
          self.layout();
          self.hop(t);
          if (self.onStep) self.onStep(mv, steps[s]);
          await sleep(STEP);
        }
        if (mv.to === L.FINISH) {
          self.burst(L.coord(mv.c, L.FINISH, mv.i), mv.c, true);
          if (self.onFinish) self.onFinish(mv);
        }
      }
      if (caps.length) {
        await sleep(60);
        if (ep !== self.epoch) return;
        if (self.onCapture) self.onCapture(caps);
        caps.forEach(function (cp) {
          var t = self.tokens[cp.c + cp.i];
          if (!t) return;
          self.burst(L.coord(cp.c, cp.from, cp.i), cp.c);
          t.g.classList.add('hit-shake');
        });
        await sleep(280);
        if (ep !== self.epoch) return;
        caps.forEach(function (cp) {
          var t = self.tokens[cp.c + cp.i];
          if (!t) return;
          t.g.classList.remove('hit-shake');
          t.g.classList.add('fly'); // captured pawns fly back to their base
          self.raise(t);
          t.pos = -1;
        });
        self.layout();
        await sleep(620);
        caps.forEach(function (cp) { var t = self.tokens[cp.c + cp.i]; if (t) t.g.classList.remove('fly'); });
      }
    }).catch(function () { /* animation errors must never break the game */ }).then(function () {
      self.busy--;
      if (!self.busy && self.onIdle) self.onIdle();
    });
  };

  Board.prototype.clearLegal = function () {
    var self = this;
    Object.keys(this.tokens).forEach(function (k) { self.tokens[k].g.classList.remove('legal'); });
    this.gDest.innerHTML = '';
  };

  // Highlights the tokens that may move and previews where each would land.
  Board.prototype.setLegal = function (color, list, roll) {
    this.clearLegal();
    var self = this;
    list.forEach(function (ti) {
      var t = self.tokens[color + ti];
      if (!t) return;
      var dest = t.pos === -1 ? 0 : t.pos + roll, xy = L.coord(color, dest, ti);
      var gh = el('g', { 'class': 'ghost' }, self.gDest);
      gh.style.transform = 'translate(' + (xy[0] * 10).toFixed(2) + 'px,' + (xy[1] * 10).toFixed(2) + 'px)';
      el('circle', { r: dest === L.FINISH ? 2.3 : 4.4, fill: PAL[color].main, 'fill-opacity': 0.3, stroke: '#fff', 'stroke-width': 1, 'stroke-dasharray': '1.6 1.4', 'class': 'ghost-ring' }, gh);
      el('circle', { r: 6, fill: 'transparent' }, gh);
      gh.addEventListener('click', function () { if (self.onPick) self.onPick(color, ti); });
      t.g.classList.add('legal');
      self.raise(t);
    });
  };

  Board.prototype.setTurn = function (color) {
    this.svg.querySelectorAll('.base').forEach(function (b) {
      b.classList.toggle('turn', b.getAttribute('data-color') === color);
    });
  };

  window.Board = Board;
})();
