/* Ludo Party – real-time 3D board (Three.js r128, vendored in /vendor).
 * Same public API as the 2D SVG Board (update / setLegal / setTurn / setRotation ...)
 * plus a physical dice that always lands on the value rolled by the server.
 * Quality tiers: 'high' | 'medium' | 'low'. The game logic never lives here:
 * the board only visualises the state it is given. */
(function () {
  'use strict';
  var THREE = window.THREE, L = window.Ludo;
  if (!THREE || !L) return;

  var TAU = Math.PI * 2;
  var PAL = {
    red: { main: 0xef4444, dark: 0x9d1717, lane: 0xf87171, hi: 0xff9b9b },
    green: { main: 0x22c55e, dark: 0x0f7433, lane: 0x4ade80, hi: 0x86efac },
    yellow: { main: 0xfbbf24, dark: 0xb36b00, lane: 0xfcd34d, hi: 0xfff0a0 },
    blue: { main: 0x3b82f6, dark: 0x1a47b8, lane: 0x60a5fa, hi: 0x9cc4ff }
  };
  var Q = {
    high: { seg: 56, shadow: 2048, dpr: 2, aa: true, env: true, physical: true, particles: 220, sway: true, bevel: 3, dice: 36, curve: 10 },
    medium: { seg: 36, shadow: 1024, dpr: 1.5, aa: true, env: true, physical: false, particles: 120, sway: true, bevel: 2, dice: 24, curve: 6 },
    low: { seg: 22, shadow: 0, dpr: 1, aa: false, env: false, physical: false, particles: 50, sway: false, bevel: 1, dice: 12, curve: 4 }
  };
  var Y_TILE = 0.14, Y_BASE = 0.27, Y_TRI = 0.19, TABLE_Y = -0.62, STEP_MS = 210;
  var ELEV = 54 * Math.PI / 180, FOV = 30, ZONE_Z = 10.4, DICE = 1.75;
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  var FACE_VAL = [2, 5, 1, 6, 3, 4];                                  // BoxGeometry order: +x -x +y -y +z -z
  var FACE_NORMAL = { 2: [1, 0, 0], 5: [-1, 0, 0], 1: [0, 1, 0], 6: [0, -1, 0], 3: [0, 0, 1], 4: [0, 0, -1] };

  var wx = function (c) { return c - 7.5; };
  var wz = function (r) { return r - 7.5; };
  function col(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }

  function canvasTex(w, h, draw, repeat, srgb) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    return t;
  }

  /* ----- geometry helpers ----- */
  function roundedRect(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  // Extrudes a shape upwards (+Y). Result spans y in [0, depth + 2*bevel].
  function slab(shape, depth, bevel, q) {
    var g = new THREE.ExtrudeGeometry(shape, {
      depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: q.bevel, curveSegments: q.curve
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bevel, 0);
    return g;
  }
  // polygon given in world (x, z) -> flat shape facing up
  function flatXZ(pts) {
    var s = new THREE.Shape();
    pts.forEach(function (p, i) { if (i) s.lineTo(p[0], -p[1]); else s.moveTo(p[0], -p[1]); });
    s.closePath();
    var g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    return g;
  }
  function starShape(ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }
  var CHEVRON = [[-0.2, 0.27], [-0.06, 0.27], [0.2, 0], [-0.06, -0.27], [-0.2, -0.27], [0.06, 0]];

  function roundedBox(size, r, seg) {
    var g = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
    var pos = g.attributes.position, nor = g.attributes.normal, h = size / 2 - r;
    var v = new THREE.Vector3(), inner = new THREE.Vector3(), n = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      inner.set(clamp(v.x, -h, h), clamp(v.y, -h, h), clamp(v.z, -h, h));
      n.subVectors(v, inner);
      if (n.lengthSq() < 1e-10) n.fromBufferAttribute(nor, i);
      n.normalize();
      v.copy(inner).addScaledVector(n, r);
      pos.setXYZ(i, v.x, v.y, v.z);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  }

  function pawnProfile(seg) {
    var pts = [[0, 0], [0.38, 0], [0.42, 0.03], [0.42, 0.09], [0.34, 0.15], [0.22, 0.24], [0.15, 0.38], [0.125, 0.52], [0.19, 0.6], [0.215, 0.64], [0.19, 0.68], [0.12, 0.7], [0.0, 0.7]]
      .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var curve = new THREE.SplineCurve(pts);
    return curve.getPoints(seg).map(function (p) { return new THREE.Vector2(Math.max(0, p.x), Math.max(0, p.y)); });
  }

  /* ----- procedural textures ----- */
  function paperTexture() {
    return canvasTex(512, 512, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(1, '#f0e2c0');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 2600; i++) { g.fillStyle = 'rgba(120,90,30,' + (Math.random() * 0.05) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    });
  }
  function tableTexture() {
    return canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = '#1a1548'; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 9000; i++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '0,0,20') + ',' + (Math.random() * 0.06) + ')'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    }, 9);
  }
  function backgroundTexture() {
    return canvasTex(256, 256, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h / 2, w * 0.75);
      gr.addColorStop(0, '#34298f'); gr.addColorStop(0.6, '#1c1655'); gr.addColorStop(1, '#0d0a2a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }
  function spriteTexture() {
    return canvasTex(64, 64, function (g, w, h) {
      var gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }
  function pipTexture(v) {
    return canvasTex(256, 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#e9e3d6');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      PIPS[v].forEach(function (idx) {
        var cx = (idx % 3 + 0.5) * w / 3, cy = (Math.floor(idx / 3) + 0.5) * h / 3, r = v === 1 ? 44 : 27;
        var p = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 1, cx, cy, r);
        if (v === 1) { p.addColorStop(0, '#ff7b86'); p.addColorStop(1, '#c8102e'); } else { p.addColorStop(0, '#4a4478'); p.addColorStop(1, '#14102f'); }
        g.fillStyle = p; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      });
    });
  }

  function studioEnv(renderer) {
    var s = new THREE.Scene();
    s.background = new THREE.Color(0x1c1745);
    function box(w, h, d, x, y, z, k, c) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
      m.position.set(x, y, z); s.add(m);
    }
    box(30, 1, 30, 0, 14, 0, 2.2, 0xffffff);
    box(1, 12, 26, -14, 6, 0, 1.8, 0xfff0dc);
    box(1, 12, 26, 14, 6, 0, 1.5, 0xdbe6ff);
    box(26, 8, 1, 0, 6, -14, 1.3, 0xffffff);
    box(26, 8, 1, 0, 6, 14, 0.9, 0xfff6e8);
    box(30, 1, 30, 0, -9, 0, 0.5, 0x4a3da0);
    var pm = new THREE.PMREMGenerator(renderer);
    var rt = pm.fromScene(s, 0.03);
    pm.dispose();
    return rt.texture;
  }

  /* ===================================================================== */
  function Board3D(host, opts) {
    opts = opts || {};
    this.host = host;
    this.qName = Q[opts.quality] ? opts.quality : 'medium';
    this.q = Q[this.qName];
    this.onSlow = opts.onSlow || null;
    this.onLost = opts.onLost || null;
    this.onPick = this.onStep = this.onCapture = this.onFinish = this.onIdle = this.onDiceTap = this.onDiceBounce = null;
    this.tokens = {}; this.snap = null; this.epoch = 0; this.chain = Promise.resolve(); this.busy = 0;
    this.k = 0; this.yaw = 0; this.yawTarget = 0;
    this.turnColor = null; this.legalList = []; this.ghosts = []; this.celebrateColor = null; this.celebrateUntil = 0;
    this.shake = 0; this.punch = 0; this.disposed = false; this.t = 0; this.frames = []; this.slowStrikes = 0; this.age = 0;
    this.diceActive = null; this.diceAnim = null; this.diceValue = 1; this.diceQuat = new THREE.Quaternion();
    this.basePlates = {}; this.mats = [];
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board3d-canvas';
    host.appendChild(this.canvas);
    this.init();
  }

  Board3D.supported = function () {
    if (Board3D._ok !== undefined) return Board3D._ok;
    var ok = false;
    try {
      var c = document.createElement('canvas');
      ok = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { ok = false; }
    Board3D._ok = ok;
    return ok;
  };
  Board3D.PAL = PAL;
  Board3D.FACE_VAL = FACE_VAL; Board3D.FACE_NORMAL = FACE_NORMAL; Board3D.ELEV = ELEV;

  Board3D.prototype.init = function () {
    var self = this, q = this.q;
    var r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q.aa, alpha: false, powerPreference: 'high-performance' });
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.NoToneMapping; // saturated, arcade-style colours
    if (q.shadow) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
    this.onCtxLost = function (e) { e.preventDefault(); if (!self.disposed && self.onLost) self.onLost(); }; // ignore the event our own dispose() causes
    this.canvas.addEventListener('webglcontextlost', this.onCtxLost);

    var scene = this.scene = new THREE.Scene();
    scene.background = backgroundTexture();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
    if (q.env) scene.environment = studioEnv(r);

    this.buildLights();
    this.buildTable();
    this.buildBoard();
    this.buildPawnAssets();
    this.buildDice();
    this.buildParticles();
    this.raycaster = new THREE.Raycaster();
    this.hitList = [];

    this.onResize = function () { self.resize(); };
    if (window.ResizeObserver) { this.ro = new ResizeObserver(this.onResize); this.ro.observe(this.host); }
    else window.addEventListener('resize', this.onResize);
    this.onClick = function (e) { self.handleClick(e); };
    this.canvas.addEventListener('click', this.onClick);
    this.onMove = function (e) { if (e.pointerType === 'mouse') self.handleHover(e); };
    this.canvas.addEventListener('pointermove', this.onMove);

    this.resize();
    this.last = performance.now();
    this.loop = function (now) { self.tick(now); };
    this.raf = requestAnimationFrame(this.loop);
  };

  /* ---------- scene construction ---------- */
  Board3D.prototype.buildLights = function () {
    var q = this.q, scene = this.scene;
    this.rig = new THREE.Group();
    scene.add(this.rig);
    scene.add(new THREE.HemisphereLight(0xe4e8ff, 0x4a3d86, q.env ? 0.42 : 0.75));
    var key = new THREE.DirectionalLight(0xfff1de, q.env ? 0.95 : 1.15);
    key.position.set(-9, 19, 12);
    if (q.shadow) {
      key.castShadow = true;
      key.shadow.mapSize.set(q.shadow, q.shadow);
      var c = key.shadow.camera; c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 4; c.far = 50;
      key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    }
    this.rig.add(key); this.rig.add(key.target);
    var rim = new THREE.DirectionalLight(0x8fb0ff, 0.45);
    rim.position.set(12, 9, -10);
    this.rig.add(rim);
  };

  Board3D.prototype.mat = function (color, o) {
    o = o || {};
    var q = this.q, p = {
      color: col(color), roughness: o.roughness == null ? 0.45 : o.roughness, metalness: o.metalness || 0
    };
    var m;
    if (q.physical && o.clearcoat) { p.clearcoat = o.clearcoat; p.clearcoatRoughness = 0.1; m = new THREE.MeshPhysicalMaterial(p); }
    else m = new THREE.MeshStandardMaterial(p);
    if (o.emissive) { m.emissive = col(o.emissive); m.emissiveIntensity = o.emissiveIntensity || 0.08; }
    if (o.map) m.map = o.map;
    if (q.env) m.envMapIntensity = o.env == null ? 0.45 : o.env;
    this.mats.push(m);
    return m;
  };

  Board3D.prototype.add = function (geo, mat, x, y, z, shadow) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (this.q.shadow) { m.castShadow = shadow !== false; m.receiveShadow = true; }
    this.board.add(m);
    return m;
  };

  Board3D.prototype.buildTable = function () {
    var g = new THREE.CircleGeometry(40, 64);
    g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, this.mat(0x9f9bc8, { roughness: 0.92, map: tableTexture() }));
    m.position.y = TABLE_Y;
    m.receiveShadow = !!this.q.shadow;
    this.scene.add(m);
  };

  Board3D.prototype.buildBoard = function () {
    var q = this.q, self = this;
    var board = this.board = new THREE.Group();
    this.scene.add(board);

    // frame: floor slab + raised rim
    var floor = this.add(slab(roundedRect(16.2, 16.2, 1.1), 0.5, 0.06, q), this.mat(0x2b2380, { roughness: 0.3, metalness: 0.25, clearcoat: 1 }), 0, TABLE_Y + 0.02 - 0.0, 0);
    floor.position.y = TABLE_Y + 0.0;
    var rimShape = roundedRect(16.2, 16.2, 1.1);
    rimShape.holes.push(new THREE.Path(roundedRect(15, 15, 0.35).getPoints(q.curve * 2)));
    var rim = slab(rimShape, 0.1, 0.05, q);
    this.add(rim, this.mat(0x4c3fc0, { roughness: 0.28, metalness: 0.35, clearcoat: 1 }), 0, 0.0, 0);
    // paper surface
    var pg = slab(roundedRect(15, 15, 0.35), 0.01, 0.005, q);
    var paperMat = this.mat(0xffffff, { roughness: 0.8, map: paperTexture() });
    paperMat.map.wrapS = paperMat.map.wrapT = THREE.RepeatWrapping; paperMat.map.repeat.set(3, 3);
    var paper = this.add(pg, paperMat, 0, -0.01, 0, false);
    paper.castShadow = false;

    // bases
    L.COLORS.forEach(function (c) {
      var o = L.BASE_ORIGIN[c], cx = wx(o[0] + 3), cz = wz(o[1] + 3), p = PAL[c];
      var plateMat = self.mat(p.main, { roughness: 0.34, clearcoat: 0.8, emissive: p.main, emissiveIntensity: 0 });
      self.basePlates[c] = plateMat;
      self.add(slab(roundedRect(6, 6, 0.55), 0.12, 0.05, q), plateMat, cx, 0, cz);
      self.add(slab(roundedRect(4.7, 4.7, 0.7), 0.01, 0.015, q), self.mat(0xfff8ea, { roughness: 0.6 }), cx, 0.2, cz, false);
      L.BASE_SPOTS.forEach(function (s) {
        var sx = wx(o[0] + s[0]), sz = wz(o[1] + s[1]);
        var disc = new THREE.CylinderGeometry(0.74, 0.74, 0.03, q.seg);
        self.add(disc, self.mat(p.hi, { roughness: 0.5 }), sx, 0.235, sz, false);
        var ring = new THREE.TorusGeometry(0.72, 0.055, 8, q.seg);
        ring.rotateX(Math.PI / 2);
        self.add(ring, self.mat(p.main, { roughness: 0.3 }), sx, 0.25, sz, false);
      });
    });

    // track + lane tiles (instanced rounded tiles)
    var tileGeo = slab(roundedRect(0.9, 0.9, 0.16), 0.08, 0.03, q);
    var total = 52 + 20;
    var inst = new THREE.InstancedMesh(tileGeo, this.mat(0xffffff, { roughness: 0.55, env: 0.22 }), total);
    if (q.shadow) { inst.castShadow = true; inst.receiveShadow = true; }
    var mtx = new THREE.Matrix4(), color = new THREE.Color(), n = 0;
    var startOf = {};
    L.COLORS.forEach(function (c) { startOf[L.START[c]] = c; });
    L.TRACK.forEach(function (cell, i) {
      mtx.makeTranslation(wx(cell[0] + 0.5), 0, wz(cell[1] + 0.5));
      inst.setMatrixAt(n, mtx);
      inst.setColorAt(n, color.copy(col(startOf[i] ? PAL[startOf[i]].main : 0xfff6e2)));
      n++;
    });
    L.COLORS.forEach(function (c) {
      L.LANES[c].forEach(function (cell) {
        mtx.makeTranslation(wx(cell[0] + 0.5), 0, wz(cell[1] + 0.5));
        inst.setMatrixAt(n, mtx);
        inst.setColorAt(n, color.copy(col(PAL[c].main)));
        n++;
      });
    });
    inst.instanceMatrix.needsUpdate = true; inst.instanceColor.needsUpdate = true;
    board.add(inst);

    // gold safe stars and direction chevrons
    var goldMat = this.mat(0xf1b82b, { roughness: 0.25, metalness: q.env ? 0.85 : 0.15, emissive: 0x7a5200, emissiveIntensity: 0.12 });
    var whiteMat = this.mat(0xffffff, { roughness: 0.4 });
    var starGeo = flatXZ(starShape(0.38, 0.16)), chevGeo = flatXZ(CHEVRON);
    var yTop = Y_TILE + 0.004;
    L.TRACK.forEach(function (cell, i) {
      var x = wx(cell[0] + 0.5), z = wz(cell[1] + 0.5);
      if (startOf[i]) {
        var nx = L.TRACK[(i + 1) % 52], m = self.add(chevGeo, whiteMat, x, yTop, z, false);
        m.rotation.y = -Math.atan2(nx[1] - cell[1], nx[0] - cell[0]);
        m.castShadow = false;
      } else if (L.SAFE.has(i)) {
        var s = self.add(starGeo, goldMat, x, yTop, z, false);
        s.castShadow = false;
      }
    });
    var laneDir = { red: 0, green: Math.PI / 2, yellow: Math.PI, blue: -Math.PI / 2 };
    L.COLORS.forEach(function (c) {
      L.LANES[c].forEach(function (cell) {
        var m = self.add(chevGeo, whiteMat, wx(cell[0] + 0.5), yTop, wz(cell[1] + 0.5), false);
        m.rotation.y = -laneDir[c]; m.material = whiteMat; m.castShadow = false;
      });
    });

    // centre: four coloured wedges and a gold medal
    var tris = { red: [[-1.5, -1.5], [-1.5, 1.5], [0, 0]], green: [[-1.5, -1.5], [1.5, -1.5], [0, 0]], yellow: [[1.5, -1.5], [1.5, 1.5], [0, 0]], blue: [[-1.5, 1.5], [1.5, 1.5], [0, 0]] };
    L.COLORS.forEach(function (c) {
      var shape = new THREE.Shape();
      tris[c].forEach(function (p, i) { if (i) shape.lineTo(p[0], -p[1]); else shape.moveTo(p[0], -p[1]); });
      shape.closePath();
      var g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelOffset: -0.04, bevelSegments: q.bevel });
      g.rotateX(-Math.PI / 2); g.translate(0, 0.04, 0);
      self.add(g, self.mat(PAL[c].main, { roughness: 0.32, clearcoat: 0.8 }), 0, 0, 0);
    });
    var medal = new THREE.CylinderGeometry(0.66, 0.74, 0.2, q.seg);
    this.add(medal, this.mat(0xf2bd2e, { roughness: 0.22, metalness: q.env ? 0.9 : 0.2, emissive: 0x7a5200, emissiveIntensity: 0.1 }), 0, 0.29, 0);
    var star = flatXZ(starShape(0.46, 0.2));
    this.add(star, this.mat(0xffffff, { roughness: 0.3 }), 0, 0.395, 0, false);
  };

  Board3D.prototype.buildPawnAssets = function () {
    var q = this.q, self = this;
    this.pawnBody = new THREE.LatheGeometry(pawnProfile(q.seg), q.seg);
    this.pawnBody.scale(1.5, 1.5, 1.5);
    this.pawnHead = new THREE.SphereGeometry(0.31, q.seg, Math.round(q.seg / 2));
    this.ringGeo = new THREE.RingGeometry(0.62, 0.8, 40); this.ringGeo.rotateX(-Math.PI / 2);
    this.hitGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.9, 10);
    this.discGeo = new THREE.CircleGeometry(0.46, 32); this.discGeo.rotateX(-Math.PI / 2);
    this.arrowGeo = new THREE.ConeGeometry(0.2, 0.46, 14); this.arrowGeo.rotateX(Math.PI);
    this.blobGeo = new THREE.CircleGeometry(0.5, 20); this.blobGeo.rotateX(-Math.PI / 2);
    this.pawnMats = {};
    L.COLORS.forEach(function (c) {
      self.pawnMats[c] = self.mat(PAL[c].main, { roughness: 0.22, clearcoat: 1, emissive: PAL[c].main, emissiveIntensity: 0.07 });
    });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
    this.hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.ghostMats = {};
    L.COLORS.forEach(function (c) {
      self.ghostMats[c] = new THREE.MeshBasicMaterial({ color: PAL[c].main, transparent: true, opacity: 0.42, depthWrite: false });
    });
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  };

  Board3D.prototype.buildDice = function () {
    var q = this.q, self = this;
    var mats = FACE_VAL.map(function (v) { return self.mat(0xffffff, { roughness: 0.32, clearcoat: 0.7, map: pipTexture(v) }); });
    var mesh = this.diceMesh = new THREE.Mesh(roundedBox(1, 0.11, q.dice), mats);
    mesh.scale.setScalar(DICE);
    if (q.shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
    this.scene.add(mesh);
    this.diceGlow = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.diceGlow.rotation.x = -Math.PI / 2;
    this.scene.add(this.diceGlow);
    if (!q.shadow) {
      this.diceBlob = new THREE.Mesh(new THREE.CircleGeometry(1, 24), this.blobMat);
      this.diceBlob.rotation.x = -Math.PI / 2; this.diceBlob.scale.setScalar(0.95);
      this.scene.add(this.diceBlob);
    }
    this.diceQuat.copy(this.quatForValue(1, 0.35));
    mesh.quaternion.copy(this.diceQuat);
    this.placeDiceAtRest();
  };

  Board3D.prototype.buildParticles = function () {
    var n = this.q.particles;
    this.pN = n;
    this.pPos = new Float32Array(n * 3); this.pCol = new Float32Array(n * 3);
    this.pVel = new Float32Array(n * 3); this.pLife = new Float32Array(n); this.pIdx = 0;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    var m = new THREE.PointsMaterial({ size: 0.42, map: spriteTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    for (var i = 0; i < n; i++) this.pPos[i * 3 + 1] = -50;
  };

  Board3D.prototype.emit = function (x, y, z, hex, count, speed, up) {
    var c = new THREE.Color(hex);
    for (var k = 0; k < count; k++) {
      var i = this.pIdx = (this.pIdx + 1) % this.pN, a = Math.random() * TAU, s = (0.4 + Math.random()) * speed;
      this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
      this.pVel[i * 3] = Math.cos(a) * s; this.pVel[i * 3 + 1] = up * (0.5 + Math.random()); this.pVel[i * 3 + 2] = Math.sin(a) * s;
      var w = Math.random() < 0.3 ? 1 : 0;
      this.pCol[i * 3] = c.r + (1 - c.r) * w * 0.7; this.pCol[i * 3 + 1] = c.g + (1 - c.g) * w * 0.7; this.pCol[i * 3 + 2] = c.b + (1 - c.b) * w * 0.7;
      this.pLife[i] = 0.7 + Math.random() * 0.6;
    }
  };

  /* ---------- camera ---------- */
  Board3D.prototype.keyPoints = function (yaw) {
    var pts = [], s = Math.sin(yaw), c = Math.cos(yaw), rot = function (x, z) { return new THREE.Vector3(x * c + z * s, 0, -x * s + z * c); };
    [[-8.1, -8.1], [8.1, -8.1], [-8.1, 8.1], [8.1, 8.1]].forEach(function (p) { var v = rot(p[0], p[1]); v.y = 0.4; pts.push(v); });
    [[-1.9, ZONE_Z - 1.3], [1.9, ZONE_Z - 1.3], [-1.9, ZONE_Z + 1.4], [1.9, ZONE_Z + 1.4]].forEach(function (p) { var v = rot(p[0], p[1]); v.y = TABLE_Y + 1.8; pts.push(v); });
    return pts;
  };
  Board3D.prototype.poseAt = function (cam, yaw, el, dist, tz) {
    var s = Math.sin(yaw), c = Math.cos(yaw), ce = Math.cos(el);
    var tx = tz * s, tzz = tz * c;
    cam.position.set(tx + dist * s * ce, dist * Math.sin(el), tzz + dist * c * ce);
    cam.lookAt(tx, 0, tzz);
    cam.updateMatrixWorld();
  };
  Board3D.prototype.fitCamera = function () {
    var cam = this.camera, pts = this.keyPoints(0), v = new THREE.Vector3(), best = null, self = this;
    function fits(dist, tz) {
      self.poseAt(cam, 0, ELEV, dist, tz);
      for (var i = 0; i < pts.length; i++) { v.copy(pts[i]).project(cam); if (Math.abs(v.x) > 0.965 || Math.abs(v.y) > 0.965) return false; }
      return true;
    }
    for (var tz = -2; tz <= 7; tz += 0.5) {
      var lo = 12, hi = 120;
      if (!fits(hi, tz)) continue;
      for (var it = 0; it < 18; it++) { var mid = (lo + hi) / 2; if (fits(mid, tz)) hi = mid; else lo = mid; }
      if (!best || hi < best.dist) best = { dist: hi, tz: tz };
    }
    this.fit = best || { dist: 40, tz: 2 };
  };
  Board3D.prototype.resize = function () {
    var w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.dpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
    this.applyCamera(0);
  };
  Board3D.prototype.applyCamera = function (t) {
    var sway = this.q.sway ? Math.sin(t * 0.3) * 0.018 : 0, swayE = this.q.sway ? Math.sin(t * 0.23) * 0.012 : 0;
    var dist = this.fit.dist * (1 - this.punch * 0.07);
    this.poseAt(this.camera, this.yaw + sway, ELEV + swayE, dist, this.fit.tz);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    this.rig.rotation.y = this.yaw;
  };

  // Rotates the camera so the local player's base is always at the bottom-left (same contract as the 2D board).
  Board3D.prototype.setRotation = function (k, animate) {
    var delta = (k - this.k + 4) % 4;
    if (delta === 3) delta = -1;
    this.k = k;
    this.yawTarget += delta * Math.PI / 2;
    if (!animate) this.yaw = this.yawTarget;
    this.layout();
  };

  /* ---------- pawns ---------- */
  Board3D.prototype.makePawn = function (c, i, pos) {
    var g = new THREE.Group(), inner = new THREE.Group(), q = this.q;
    var body = new THREE.Mesh(this.pawnBody, this.pawnMats[c]);
    var head = new THREE.Mesh(this.pawnHead, this.pawnMats[c]);
    head.position.y = 1.29;
    if (q.shadow) { body.castShadow = head.castShadow = true; body.receiveShadow = head.receiveShadow = true; }
    inner.add(body); inner.add(head);
    g.add(inner);
    var ring = new THREE.Mesh(this.ringGeo, this.ringMat); ring.position.y = 0.03; ring.visible = false; g.add(ring);
    var hit = new THREE.Mesh(this.hitGeo, this.hitMat); hit.position.y = 0.95; hit.userData.pick = { c: c, i: i }; g.add(hit);
    if (!q.shadow) { var blob = new THREE.Mesh(this.blobGeo, this.blobMat); blob.position.y = 0.02; g.add(blob); }
    this.scene.add(g);
    var t = { g: g, inner: inner, ring: ring, hit: hit, c: c, i: i, pos: pos, legal: false, tween: null, target: { x: 0, y: 0, z: 0, s: 1 } };
    return t;
  };

  Board3D.prototype.build = function (snap) {
    var self = this;
    this.epoch++;
    Object.keys(this.tokens).forEach(function (k) { self.scene.remove(self.tokens[k].g); });
    this.tokens = {};
    this.clearLegal();
    Object.keys(snap).forEach(function (c) {
      for (var i = 0; i < 4; i++) self.tokens[c + i] = self.makePawn(c, i, snap[c][i]);
    });
    L.COLORS.forEach(function (c) {
      var m = self.basePlates[c], present = !!snap[c];
      m.color.copy(col(present ? PAL[c].main : 0x8b87a8));
      m.roughness = present ? 0.34 : 0.7;
    });
    this.layout();
    Object.keys(this.tokens).forEach(function (k) { self.snapToTarget(self.tokens[k]); });
  };

  var OFFS = {
    2: [[-0.23, 0], [0.23, 0]],
    3: [[-0.24, -0.15], [0.24, -0.15], [0, 0.23]],
    4: [[-0.23, -0.23], [0.23, -0.23], [-0.23, 0.23], [0.23, 0.23]]
  };
  Board3D.prototype.layout = function () {
    var groups = {}, self = this;
    Object.keys(this.tokens).forEach(function (k) {
      var t = self.tokens[k], xy = L.coord(t.c, t.pos, t.i);
      t.base = { x: wx(xy[0]), z: wz(xy[1]) };
      if (t.pos === L.FINISH) { t.base.x *= 1.22; t.base.z *= 1.22; }
      t.sc = t.pos === L.FINISH ? 0.4 : (t.pos === -1 ? 0.85 : 0.7);
      t.dx = 0; t.dz = 0;
      if (t.pos > -1 && t.pos < L.FINISH) {
        var key = xy[0].toFixed(2) + ',' + xy[1].toFixed(2);
        (groups[key] = groups[key] || []).push(t);
      }
    });
    Object.keys(groups).forEach(function (key) {
      var arr = groups[key], n = Math.min(arr.length, 4);
      if (n < 2) return;
      arr.forEach(function (t, idx) { var o = OFFS[n][Math.min(idx, 3)]; t.dx = o[0]; t.dz = o[1]; t.sc = 0.5; });
    });
    Object.keys(this.tokens).forEach(function (k) {
      var t = self.tokens[k];
      var y = t.pos === -1 ? Y_BASE : (t.pos === L.FINISH ? Y_TRI : Y_TILE);
      t.target = { x: t.base.x + t.dx, y: y, z: t.base.z + t.dz, s: t.sc };
    });
  };
  Board3D.prototype.snapToTarget = function (t) {
    t.g.position.set(t.target.x, t.target.y, t.target.z);
    t.g.scale.setScalar(t.target.s);
  };

  // Runs a hop tween from the pawn's current position to its (already laid out) target.
  Board3D.prototype.tween = function (t, dur, hop, spin) {
    var self = this;
    return new Promise(function (resolve) {
      var done = false;
      function fin() { if (done) return; done = true; t.tween = null; self.snapToTarget(t); resolve(); }
      t.tween = {
        t0: self.t, dur: dur / 1000, hop: hop, spin: spin || 0, fin: fin,
        from: { x: t.g.position.x, y: t.g.position.y, z: t.g.position.z, s: t.g.scale.x }
      };
      setTimeout(fin, dur + 600); // safety net if the tab was hidden
    });
  };

  // Diff-based update: walks tokens along the track towards the new server state.
  Board3D.prototype.update = function (snap, reset) {
    function clone(o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = o[k].slice(); }); return r; }
    var newKeys = Object.keys(snap).sort().join(), oldKeys = this.snap ? Object.keys(this.snap).sort().join() : null;
    if (reset || !this.snap || newKeys !== oldKeys) { this.snap = clone(snap); this.build(snap); return; }
    var prev = this.snap, movers = [], caps = [];
    this.snap = clone(snap);
    Object.keys(snap).forEach(function (c) {
      snap[c].forEach(function (b, i) {
        var a = prev[c][i];
        if (a === b) return;
        if (b === -1) caps.push({ c: c, i: i, from: a }); else movers.push({ c: c, i: i, from: a, to: b });
      });
    });
    if (!movers.length && !caps.length) return;
    var self = this, ep = this.epoch;
    this.busy++;
    this.chain = this.chain.then(async function () {
      for (var m = 0; m < movers.length; m++) {
        var mv = movers[m], t = self.tokens[mv.c + mv.i];
        if (!t || ep !== self.epoch) return;
        var steps = [];
        if (mv.from === -1) steps.push(mv.to); else for (var p = mv.from + 1; p <= mv.to; p++) steps.push(p);
        for (var s = 0; s < steps.length; s++) {
          if (ep !== self.epoch) return;
          t.pos = steps[s];
          self.layout();
          if (self.onStep) self.onStep(mv, steps[s]);
          await self.tween(t, mv.from === -1 ? STEP_MS * 2 : STEP_MS, mv.from === -1 ? 1.5 : 0.5);
          var wp = t.g.position;
          if (steps[s] === L.FINISH) break;
          self.emit(wp.x, wp.y + 0.1, wp.z, PAL[mv.c].hi, 2, 0.8, 1.2);
        }
        if (mv.to === L.FINISH) {
          var fp = t.g.position;
          self.emit(fp.x, fp.y + 0.6, fp.z, 0xffd34d, Math.min(40, self.pN / 4), 3.2, 4);
          if (self.onFinish) self.onFinish(mv);
        }
      }
      if (caps.length) {
        await sleep(40);
        if (ep !== self.epoch) return;
        if (self.onCapture) self.onCapture(caps);
        self.shake = 0.35; self.punch = 1;
        var flights = [];
        caps.forEach(function (cp) {
          var t = self.tokens[cp.c + cp.i];
          if (!t) return;
          var wp = t.g.position;
          self.emit(wp.x, wp.y + 0.5, wp.z, PAL[cp.c].main, Math.min(48, self.pN / 3), 4.2, 4.5);
          t.pos = -1;
        });
        self.layout();
        caps.forEach(function (cp) { var t = self.tokens[cp.c + cp.i]; if (t) flights.push(self.tween(t, 820, 3.8, 1)); });
        await Promise.all(flights);
      }
    }).catch(function () { /* animation errors must never break the game */ }).then(function () {
      self.busy--;
      if (!self.busy && self.onIdle) self.onIdle();
    });
  };

  /* ---------- selection / guidance ---------- */
  Board3D.prototype.clearLegal = function () {
    var self = this;
    Object.keys(this.tokens).forEach(function (k) { var t = self.tokens[k]; t.legal = false; t.ring.visible = false; });
    this.ghosts.forEach(function (g) { self.scene.remove(g.group); });
    this.ghosts = [];
  };
  Board3D.prototype.setLegal = function (color, list, roll) {
    this.clearLegal();
    var self = this;
    list.forEach(function (ti) {
      var t = self.tokens[color + ti];
      if (!t) return;
      t.legal = true; t.ring.visible = true;
      var dest = t.pos === -1 ? 0 : t.pos + roll, xy = L.coord(color, dest, ti);
      var gr = new THREE.Group();
      gr.position.set(wx(xy[0]), dest === L.FINISH ? Y_TRI : Y_TILE, wz(xy[1]));
      var disc = new THREE.Mesh(self.discGeo, self.ghostMats[color]); disc.position.y = 0.03; gr.add(disc);
      var ring = new THREE.Mesh(self.ringGeo, self.ringMat); ring.position.y = 0.04; ring.scale.setScalar(0.85); gr.add(ring);
      var arrow = new THREE.Mesh(self.arrowGeo, self.arrowMat); arrow.position.y = 1.5; gr.add(arrow);
      var hit = new THREE.Mesh(self.hitGeo, self.hitMat); hit.position.y = 0.75; hit.userData.pick = { c: color, i: ti }; gr.add(hit);
      self.scene.add(gr);
      self.ghosts.push({ group: gr, arrow: arrow, ring: ring, hit: hit });
    });
  };
  Board3D.prototype.setTurn = function (color) { this.turnColor = color; };
  Board3D.prototype.celebrate = function (color) { this.celebrateColor = color; this.celebrateUntil = this.t + 6; };

  /* ---------- dice ---------- */
  Board3D.prototype.zoneWorld = function (yaw) {
    var s = Math.sin(yaw), c = Math.cos(yaw);
    return { x: ZONE_Z * s, z: ZONE_Z * c };
  };
  Board3D.prototype.restY = function () { return TABLE_Y + DICE / 2; };
  Board3D.prototype.placeDiceAtRest = function () {
    var z = this.zoneWorld(this.yaw);
    this.diceMesh.position.set(z.x, this.restY(), z.z);
    this.restPos = { x: z.x, z: z.z };
  };
  // quaternion that puts face `v` on top, with an extra rotation around the vertical axis
  Board3D.prototype.quatForValue = function (v, yawExtra) {
    var n = FACE_NORMAL[v], q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(n[0], n[1], n[2]), new THREE.Vector3(0, 1, 0));
    var qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawExtra);
    return qy.multiply(q);
  };
  Board3D.prototype.setDiceValue = function (v) {
    this.diceValue = v;
    this.diceQuat.copy(this.quatForValue(v, 0.35));
    this.diceMesh.quaternion.copy(this.diceQuat);
    this.placeDiceAtRest();
  };
  Board3D.prototype.setDiceActive = function (hex) { this.diceActive = hex == null ? null : hex; };
  // Throws the dice; it bounces on the table and lands showing `value`. Resolves when it has settled.
  Board3D.prototype.rollDice = function (value, cb) {
    var self = this, from = this.diceMesh.position.clone(), z = this.zoneWorld(this.yaw);
    var s = Math.sin(this.yaw), c = Math.cos(this.yaw), jx = (Math.random() - 0.5) * 1.6, jz = (Math.random() - 0.5) * 0.7;
    var to = new THREE.Vector3(z.x + jx * c + jz * s, this.restY(), z.z - jx * s + jz * c);
    var side = Math.random() < 0.5 ? -1 : 1;
    var start = new THREE.Vector3(z.x + (-7 * side) * c + 2 * s, this.restY() + 1.5, z.z + (7 * side) * s + 5 * c);
    var ax1 = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    var ax2 = new THREE.Vector3(Math.random() - 0.5, 0.3 + Math.random(), Math.random() - 0.5).normalize();
    this.diceAnim = {
      t0: this.t, dur: 1.55, start: start, to: to, from: from, ax1: ax1, ax2: ax2,
      th1: (3 + Math.random() * 1.5) * TAU, th2: (1.5 + Math.random()) * TAU,
      qf: this.quatForValue(value, Math.random() * TAU), bounce: 0, cb: cb || null, value: value
    };
    this.diceValue = value;
    this.diceMesh.position.copy(start);
  };

  /* ---------- picking ---------- */
  Board3D.prototype.pointerHit = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 2 - 1, y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera({ x: x, y: y }, this.camera);
    var objs = [];
    this.ghosts.forEach(function (g) { objs.push(g.hit); });
    var self = this;
    Object.keys(this.tokens).forEach(function (k) { var t = self.tokens[k]; if (t.legal) objs.push(t.hit); });
    var hits = this.raycaster.intersectObjects(objs, false);
    if (hits.length) return { pick: hits[0].object.userData.pick };
    if (this.raycaster.intersectObject(this.diceMesh, false).length) return { dice: true };
    return null;
  };
  Board3D.prototype.handleClick = function (e) {
    var h = this.pointerHit(e);
    if (!h) return;
    if (h.pick && this.onPick) this.onPick(h.pick.c, h.pick.i);
    else if (h.dice && this.onDiceTap) this.onDiceTap();
  };
  Board3D.prototype.handleHover = function (e) {
    var h = this.pointerHit(e);
    this.canvas.style.cursor = h && (h.pick || (h.dice && this.diceActive != null)) ? 'pointer' : 'default';
  };

  /* ---------- main loop ---------- */
  Board3D.prototype.tick = function (now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    var dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.host.clientWidth < 4) return; // hidden screen: skip all work
    this.t += dt; this.age += dt;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
    this.monitor(dt);
  };

  Board3D.prototype.monitor = function (dt) {
    if (this.age < 2) return;
    this.frames.push(dt);
    if (this.frames.length < 90) return;
    var avg = this.frames.reduce(function (a, b) { return a + b; }, 0) / this.frames.length;
    this.frames = [];
    if (avg > 0.04) this.slowStrikes++; else this.slowStrikes = 0;
    if (this.slowStrikes >= 2 && this.onSlow) { this.slowStrikes = 0; this.onSlow(avg); }
  };

  Board3D.prototype.step = function (dt) {
    var self = this, t = this.t;
    // camera orbit towards the target yaw
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 5.5);
    if (Math.abs(this.yawTarget - this.yaw) < 0.0005) this.yaw = this.yawTarget;
    this.shake *= Math.pow(0.0006, dt); this.punch *= Math.pow(0.02, dt);
    this.applyCamera(t);

    // base plates: the active player's base glows
    L.COLORS.forEach(function (c) {
      var m = self.basePlates[c];
      m.emissiveIntensity = c === self.turnColor ? 0.22 + 0.18 * Math.sin(t * 4) : 0;
    });

    // pawns
    var celebrating = this.celebrateColor && t < this.celebrateUntil;
    Object.keys(this.tokens).forEach(function (k) {
      var p = self.tokens[k], g = p.g;
      if (p.tween) {
        var tw = p.tween, u = Math.min(1, (t - tw.t0) / tw.dur), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        var lin = tw.hop > 2 ? easeOut(u) : e;
        g.position.x = tw.from.x + (p.target.x - tw.from.x) * lin;
        g.position.z = tw.from.z + (p.target.z - tw.from.z) * lin;
        g.position.y = tw.from.y + (p.target.y - tw.from.y) * lin + Math.sin(u * Math.PI) * tw.hop;
        var sc = tw.from.s + (p.target.s - tw.from.s) * lin;
        var squash = 1 + (u < 0.15 ? -0.1 * (u / 0.15) : (u > 0.85 ? -0.1 * ((u - 0.85) / 0.15) : 0.04));
        g.scale.set(sc / Math.sqrt(squash), sc * squash, sc / Math.sqrt(squash));
        g.rotation.y = tw.spin ? u * TAU * 2 : 0;
        if (u >= 1) { g.rotation.y = 0; tw.fin(); }
      } else {
        var f = Math.min(1, dt * 14);
        g.position.x += (p.target.x - g.position.x) * f; g.position.z += (p.target.z - g.position.z) * f; g.position.y += (p.target.y - g.position.y) * f;
        var s0 = g.scale.x; g.scale.setScalar(s0 + (p.target.s - s0) * f);
      }
      var bob = 0;
      if (p.legal) { bob = 0.12 + 0.1 * Math.sin(t * 7); p.ring.rotation.y = t * 1.5; p.ring.scale.setScalar(1 + 0.12 * Math.sin(t * 6)); }
      if (celebrating && p.c === self.celebrateColor) bob = Math.abs(Math.sin(t * 6 + p.i)) * 0.7;
      p.inner.position.y = bob;
    });
    this.ghosts.forEach(function (gh) {
      gh.arrow.position.y = 1.45 + 0.2 * Math.sin(t * 6);
      gh.ring.scale.setScalar(0.85 + 0.1 * Math.sin(t * 6));
    });
    if (celebrating && Math.random() < 0.35) this.emit((Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6, 0xffd34d, 4, 1.6, 7);

    this.stepDice(dt);
    this.stepParticles(dt);
  };

  Board3D.prototype.stepDice = function (dt) {
    var d = this.diceAnim, m = this.diceMesh, t = this.t, baseY = this.restY();
    if (d) {
      var u = Math.min(1, (t - d.t0) / d.dur), T0 = [0, 0.4, 0.68, 0.86, 1], H = [4.6, 1.7, 0.55, 0.16];
      var seg = 0; while (seg < 3 && u > T0[seg + 1]) seg++;
      var s = (u - T0[seg]) / (T0[seg + 1] - T0[seg]);
      var h = H[seg] * 4 * s * (1 - s);
      var travel = easeOut(Math.min(1, u / 0.88));
      m.position.x = d.start.x + (d.to.x - d.start.x) * travel;
      m.position.z = d.start.z + (d.to.z - d.start.z) * travel;
      m.position.y = baseY + (seg === 0 ? (d.start.y - baseY) * (1 - s) : 0) + h;
      var k = Math.pow(1 - u, 2);
      var q1 = new THREE.Quaternion().setFromAxisAngle(d.ax1, d.th1 * k), q2 = new THREE.Quaternion().setFromAxisAngle(d.ax2, d.th2 * k);
      m.quaternion.copy(q1).multiply(q2).multiply(d.qf);
      if (seg > d.bounce) { d.bounce = seg; if (this.onDiceBounce) this.onDiceBounce(seg); this.emit(m.position.x, baseY - 0.5, m.position.z, 0xffffff, 3, 1.2, 0.8); }
      if (u >= 1) {
        this.diceQuat.copy(d.qf); m.quaternion.copy(d.qf);
        this.restPos = { x: d.to.x, z: d.to.z };
        this.diceAnim = null;
        if (d.cb) d.cb();
      }
    } else {
      // follow the camera orbit while resting
      var z = this.zoneWorld(this.yaw);
      m.position.x += (z.x - m.position.x) * Math.min(1, dt * 6); m.position.z += (z.z - m.position.z) * Math.min(1, dt * 6);
      m.position.y = baseY;
    }
    var glow = this.diceGlow;
    if (this.diceActive != null && !d) {
      glow.material.color.set(this.diceActive);
      glow.material.opacity = 0.5 + 0.3 * Math.sin(t * 5);
      glow.position.set(m.position.x, TABLE_Y + 0.03, m.position.z);
      glow.scale.setScalar(1.5 + 0.1 * Math.sin(t * 5));
    } else glow.material.opacity = 0;
    if (this.diceBlob) {
      this.diceBlob.position.set(m.position.x, TABLE_Y + 0.02, m.position.z);
      var hgt = Math.max(0, m.position.y - baseY);
      this.diceBlob.material = this.blobMat; this.diceBlob.scale.setScalar(Math.max(0.5, 0.95 - hgt * 0.1));
    }
  };

  Board3D.prototype.stepParticles = function (dt) {
    var n = this.pN, any = false;
    for (var i = 0; i < n; i++) {
      if (this.pLife[i] <= 0) continue;
      any = true;
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 9 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -50; }
      else { var f = Math.min(1, this.pLife[i] * 2); this.pCol[i * 3] *= 1 - dt * 1.2; this.pCol[i * 3 + 1] *= 1 - dt * 1.2; this.pCol[i * 3 + 2] *= 1 - dt * 1.2; void f; }
    }
    if (any || this.pDirty) { this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true; }
    this.pDirty = any;
  };

  Board3D.prototype.dispose = function () {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.ro) this.ro.disconnect(); else window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onCtxLost);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('pointermove', this.onMove);
    var self = this;
    Object.keys(this.tokens).forEach(function (k) { if (self.tokens[k].tween) self.tokens[k].tween.fin(); });
    this.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    if (this.scene.environment) this.scene.environment.dispose();
    if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
    this.renderer.dispose();
    try { this.renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  };

  window.Board3D = Board3D;
})();
