/* Ludo Party – client application. All game state comes from the server. */
(function () {
  'use strict';
  var L = window.Ludo, T = window.I18N.t, PAL = window.Board.PAL;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var CAT = window.Catalog;
  // index 11 (robot) is reserved for bots and is never offered in the picker
  var AVATARS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🐙', '🦄', '🐲', '🦅', '🐬', '🐱', '🤖',
    '🐶', '🐺', '🦉', '🐢', '🦈', '🐒', '🦋', '🐧', '🦖', '🐘', '🦓', '🐨', '🦜', '🐝', '🦔', '🐳',
    '🤠', '🥷', '🧙', '🧛', '🧜', '🦸', '👸', '🤴', '👾', '🦇', '🎅', '👻'];
  function randAvatar() { var i; do { i = Math.floor(Math.random() * AVATARS.length); } while (i === CAT.BOT_AVATAR); return i; }
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  // cube orientation [rotateX, rotateY] that brings each face towards the player
  var ORI = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };

  /* ---------- storage ---------- */
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? Object.assign({}, d, v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function loadSession() { try { return JSON.parse(sessionStorage.getItem('ludo.session')); } catch (e) { return null; } }
  function saveSession() { try { if (S.me) sessionStorage.setItem('ludo.session', JSON.stringify(S.me)); } catch (e) { /* ignore */ } }
  function clearSession() { try { sessionStorage.removeItem('ludo.session'); } catch (e) { /* ignore */ } }

  var prefs = load('ludo.prefs', { lang: 'ar', sfx: true, music: false, autoMove: true, rotate: true, gfx: 'auto', feed: true });
  var profile = load('ludo.profile', { name: '', avatar: randAvatar(), color: 'red', games: 0, wins: 0 });
  if (!(profile.avatar >= 0 && profile.avatar < AVATARS.length && profile.avatar !== CAT.BOT_AVATAR)) profile.avatar = 0;
  profile.style = (function (st) {
    var d = CAT.DEFAULT_STYLE, ok = function (list, v, def) { return list.indexOf(v) >= 0 ? v : def; };
    st = st || {};
    return { theme: ok(CAT.THEMES, st.theme, d.theme), pawn: ok(CAT.PAWNS, st.pawn, d.pawn), finish: ok(CAT.FINISHES, st.finish, d.finish), dice: ok(CAT.DICES, st.dice, d.dice) };
  })(profile.style);
  if (L.COLORS.indexOf(profile.color) < 0) profile.color = 'red';

  var S = {
    screen: 'menu', room: null, me: null, connected: false, everConnected: false, wasDown: false,
    board: null, lastRollId: -1, lastActionId: null, prevTurn: null, diceAnim: false, rolling: false, moving: false,
    resultShown: false, joinColor: null, joinTaken: [], joinOk: false, peekTimer: null, diceTimer: null,
    chips: null, rot: 0, spin: 0, clockOffset: 0, autoPick: null, lastTick: 0,
    gfx: null, is3d: false, autoGfx: null, forceClassic: false, diceBuilt: false, boardTheme: null
  };

  var socket = io({ reconnectionDelayMax: 3000 });

  /* ---------- ui helpers ---------- */
  function playerOf(st, color) { return st && st.players[L.COLORS.indexOf(color)] || null; }
  function nameOf(st, p) {
    if (!p) return '';
    if (!p.bot) return p.name;
    var n = 0;
    for (var i = 0; i < 4; i++) { var q = st.players[i]; if (q && q.bot) { n++; if (q.color === p.color) return T('botName', { n: n }); } }
    return p.name;
  }
  function setAvatar(node, idx, color) {
    node.textContent = AVATARS[idx] || AVATARS[0];
    node.style.setProperty('--ac', PAL[color || profile.color].main);
  }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* optional */ } }

  function toast(msg, kind) {
    var box = $('#toasts');
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    var d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.textContent = msg;
    box.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2700);
  }
  function errText(code) { return T('err.' + code) === 'err.' + code ? T('err.BAD_INPUT') : T('err.' + code); }
  function setLoader(on) { $('#loader').hidden = !on; }

  function show(name) {
    if (name !== 'style') stopPreview();
    S.screen = name;
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + name); });
    closeModals();
    $('#emoji-panel').hidden = true;
    placeChat();
  }
  function openModal(id) { var m = $('#' + id); m.hidden = false; requestAnimationFrame(function () { m.classList.add('open'); }); }
  function closeModals() { $$('.modal').forEach(function (m) { m.classList.remove('open'); m.hidden = true; }); }

  function request(ev, data, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var done = false, lt = null, to = null;
      function fin(r) {
        if (done) return;
        done = true; clearTimeout(lt); clearTimeout(to);
        if (!opts.noLoader) setLoader(false);
        resolve(r);
      }
      if (!socket.connected) return fin({ ok: false, error: 'NETWORK' });
      if (!opts.noLoader) lt = setTimeout(function () { setLoader(true); }, 250);
      to = setTimeout(function () { fin({ ok: false, error: 'NETWORK' }); }, 8000);
      socket.emit(ev, data, fin);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy'); document.body.removeChild(ta);
        ok ? res() : rej();
      } catch (e) { rej(e); }
    });
  }
  function inviteLink(code) { return location.origin + '/?room=' + code; }

  /* ---------- profile ---------- */
  function defaultName() { return (window.I18N.lang === 'ar' ? 'لاعب ' : 'Player ') + (10 + Math.floor(Math.random() * 90)); }
  function currentName() {
    if (!profile.name.trim()) { profile.name = defaultName(); save('ludo.profile', profile); syncProfileUI(); }
    return profile.name.trim();
  }
  function renderMenuStats() {
    var box = $('#menu-stats');
    box.innerHTML = '';
    [[profile.wins || 0, T('stWins')], [profile.games || 0, T('stGames')]].forEach(function (x) {
      var s = document.createElement('span'), b = document.createElement('b');
      b.textContent = x[0]; s.appendChild(b); s.appendChild(document.createTextNode(' ' + x[1])); box.appendChild(s);
    });
  }
  function syncProfileUI() {
    $$('#inp-name, .name-input').forEach(function (i) { if (i.value !== profile.name) i.value = profile.name; });
    setAvatar($('#menu-avatar'), profile.avatar, profile.color);
    $$('[data-avatar-view]').forEach(function (n) { setAvatar(n, profile.avatar, profile.color); });
    renderMenuStats();
  }
  function renderColors(box, selected, taken, onPick) {
    box.innerHTML = '';
    L.COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-dot' + (c === selected ? ' sel' : '');
      b.style.setProperty('--c', PAL[c].main);
      b.style.setProperty('--cd', PAL[c].dark);
      b.disabled = taken.indexOf(c) >= 0 && c !== selected;
      b.setAttribute('aria-label', T('c.' + c));
      b.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
      b.addEventListener('click', function () { window.Sound.click(); onPick(c); });
      box.appendChild(b);
    });
  }
  function renderCreateColors() {
    renderColors($('#create-colors'), profile.color, [], function (c) { profile.color = c; save('ludo.profile', profile); syncProfileUI(); renderCreateColors(); });
  }
  function renderJoinColors() {
    if (!S.joinColor || S.joinTaken.indexOf(S.joinColor) >= 0) S.joinColor = L.COLORS.filter(function (c) { return S.joinTaken.indexOf(c) < 0; })[0] || profile.color;
    renderColors($('#join-colors'), S.joinColor, S.joinTaken, function (c) { S.joinColor = c; renderJoinColors(); });
  }

  /* ---------- session / room lifecycle ---------- */
  function afterEnterRoom(r) {
    if (!S.me || S.me.code !== r.code) resetChat();
    S.me = { code: r.code, pid: r.pid, color: r.color };
    saveSession();
    if (S.room && S.room.code === r.code) handleState(S.room);
  }
  function createRoom() {
    window.Sound.click();
    request('room:create', { name: currentName(), avatar: profile.avatar, color: profile.color, skin: mySkin() }).then(function (r) {
      if (!r.ok) return toast(errText(r.error), 'bad');
      afterEnterRoom(r);
    });
  }
  function joinRoom() {
    window.Sound.click();
    var code = $('#inp-code').value.trim().toUpperCase();
    if (code.length !== 5) { toast(errText('ROOM_NOT_FOUND'), 'bad'); return; }
    request('room:join', { code: code, name: currentName(), avatar: profile.avatar, color: S.joinColor, skin: mySkin() }).then(function (r) {
      if (!r.ok) { window.Sound.error(); if (r.error === 'COLOR_TAKEN' || r.error === 'ROOM_NOT_FOUND') peekCode(); return toast(errText(r.error), 'bad'); }
      afterEnterRoom(r);
    });
  }
  function leaveRoom() {
    request('room:leave', {}, { noLoader: true });
    clearSession();
    S.me = null; S.room = null; S.resultShown = false;
    resetChat();
    $('#modal-result').classList.remove('open');
    if (S.board) S.board.snap = null;
    show('menu');
  }
  function peekCode() {
    var code = $('#inp-code').value.trim().toUpperCase(), box = $('#join-status');
    clearTimeout(S.peekTimer);
    S.joinOk = false;
    if (code.length < 5) { box.textContent = ''; box.className = 'join-status'; S.joinTaken = []; renderJoinColors(); return; }
    box.textContent = T('checking'); box.className = 'join-status';
    S.peekTimer = setTimeout(function () {
      request('room:peek', { code: code }, { noLoader: true }).then(function (r) {
        if ($('#inp-code').value.trim().toUpperCase() !== code) return;
        if (!r.ok) { box.textContent = errText(r.error); box.className = 'join-status bad'; S.joinTaken = []; }
        else if (r.phase !== 'lobby') { box.textContent = errText('GAME_STARTED'); box.className = 'join-status bad'; S.joinTaken = r.taken; }
        else if (r.count >= 4) { box.textContent = errText('ROOM_FULL'); box.className = 'join-status bad'; S.joinTaken = r.taken; }
        else { box.textContent = T('roomOpen', { n: r.count }); box.className = 'join-status good'; S.joinTaken = r.taken; S.joinOk = true; }
        renderJoinColors();
      });
    }, 150);
  }

  function tryRejoin() {
    var ses = loadSession();
    if (!ses || !ses.code || !ses.pid) return;
    request('room:rejoin', { code: ses.code, pid: ses.pid }, { noLoader: true }).then(function (r) {
      if (r.ok) return afterEnterRoom(r);
      if (r.error === 'NETWORK') return;
      clearSession(); S.me = null; S.room = null;
      if (S.screen === 'lobby' || S.screen === 'game') { toast(errText(r.error), 'bad'); show('menu'); }
    });
  }

  /* ---------- state routing ---------- */
  function handleState(st) {
    S.room = st;
    if (st.now) S.clockOffset = st.now - Date.now();
    if (!S.me || S.me.code !== st.code) return;
    if (chatOpen()) { renderChatTo(); $('#chat-input').disabled = !chatOn(); $('#btn-chat-send').disabled = !chatOn(); $('#chat-off').hidden = chatOn(); }
    S.moving = false;
    if (st.phase === 'lobby') {
      if (S.screen !== 'lobby') { S.resultShown = false; $('#modal-result').classList.remove('open'); $('#modal-result').hidden = true; if (S.board) S.board.snap = null; show('lobby'); }
      renderLobby();
      return;
    }
    var enter = S.screen !== 'game';
    if (enter) enterGame(st);
    renderGame(st, enter);
    if (st.phase === 'ended') scheduleResult(st);
    else { S.resultShown = false; }
  }

  /* ---------- lobby ---------- */
  function renderLobby() {
    var st = S.room, me = S.me, iAmHost = st.host === me.color;
    $('#lobby-code').textContent = st.code;
    var box = $('#lobby-slots');
    box.innerHTML = '';
    var others = [], allReady = true, count = 0;
    L.COLORS.forEach(function (c, i) {
      var p = st.players[i], slot = document.createElement('div');
      slot.className = 'slot' + (p ? '' : ' empty') + (p && c === me.color ? ' me' : '');
      slot.setAttribute('data-color', c);
      slot.style.setProperty('--c', PAL[c].main);
      if (!p) {
        slot.innerHTML = '<span class="slot-dot"></span><span class="muted"></span>';
        slot.lastChild.textContent = T('waitingSeat');
      } else {
        count++; others.push(c);
        if (c !== st.host && (!p.ready || !p.connected)) allReady = false;
        var av = document.createElement('span'); av.className = 'avatar'; setAvatar(av, p.avatar, c);
        var info = document.createElement('div'); info.className = 'slot-info';
        var nm = document.createElement('b'); nm.textContent = nameOf(st, p); info.appendChild(nm);
        if (c === st.host) { var h = document.createElement('span'); h.className = 'tag'; h.innerHTML = '<svg class="ic"><use href="#i-crown"/></svg>'; h.appendChild(document.createTextNode(T('host'))); info.appendChild(h); }
        slot.appendChild(av); slot.appendChild(info);
        if (p.bot && iAmHost) {
          var x = document.createElement('button'); x.className = 'slot-x'; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', T('removeBot'));
          x.addEventListener('click', function () { window.Sound.click(); request('room:removeBot', { color: c }, { noLoader: true }).then(function (r) { if (!r.ok) toast(errText(r.error), 'bad'); }); });
          slot.appendChild(x);
        } else {
          var bd = document.createElement('span');
          bd.className = 'badge ' + (!p.connected ? 'off' : p.ready ? 'ok' : 'wait');
          bd.textContent = !p.connected ? '⚠' : p.ready ? '✓ ' + T('ready') : '…';
          slot.appendChild(bd);
        }
      }
      box.appendChild(slot);
    });
    renderColors($('#lobby-colors'), me.color, others.filter(function (c) { return c !== me.color; }), function (c) {
      request('room:color', { color: c }, { noLoader: true }).then(function (r) {
        if (!r.ok) return toast(errText(r.error), 'bad');
        S.me.color = r.color; saveSession(); profile.color = r.color; save('ludo.profile', profile);
        if (S.room) renderLobby();
      });
    });
    // host rules
    var s = st.settings;
    $$('#seg-timer button').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-t') === s.timer); b.disabled = !iAmHost; });
    [['#rs-cap', s.bonusCapture], ['#rs-home', s.bonusHome], ['#rs-chat', s.chat !== false]].forEach(function (x) { var sw = $(x[0]); sw.setAttribute('aria-checked', String(x[1])); sw.disabled = !iAmHost; });
    $('#btn-addbot').hidden = !iAmHost || count >= 4;

    var hint = $('#lobby-hint'), rb = $('#btn-ready'), sb = $('#btn-start');
    rb.hidden = iAmHost; sb.hidden = !iAmHost;
    if (iAmHost) {
      sb.disabled = !(count >= 2 && allReady);
      hint.textContent = count < 2 ? T('hintNeed') : allReady ? T('hintHost') : T('hintWaitReady');
    } else {
      var mine = playerOf(st, me.color), ready = mine && mine.ready;
      rb.textContent = ready ? T('cancelReady') : T('imReady');
      rb.className = 'btn xl ' + (ready ? 'secondary' : 'primary');
      hint.textContent = ready ? T('hintGuestReady') : T('hintGuest');
    }
  }

  /* ---------- game screen ---------- */
  function buildChips() {
    if (S.chips) return;
    S.chips = {};
    L.COLORS.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'chip'; d.setAttribute('data-color', c);
      d.style.setProperty('--c', PAL[c].main);
      d.innerHTML = '<div class="av"><svg class="ring" viewBox="0 0 44 44"><circle class="rt" cx="22" cy="22" r="19.5"/><circle class="rf" cx="22" cy="22" r="19.5" pathLength="100"/></svg><span class="avatar sm"></span></div>' +
        '<div class="chip-info"><div class="chip-name"></div><div class="chip-pips"><i></i><i></i><i></i><i></i></div></div><svg class="ic chip-off"><use href="#i-wifi-off"/></svg>';
      S.chips[c] = d;
    });
  }
  // Corner order is TL, TR, BR, BL (clockwise). Rotating the board by k quarter turns moves colour i to corner (i+k)%4.
  function placeChips(k) {
    var top = $('#hud-top'), bot = $('#hud-bot');
    var at = function (corner) { return L.COLORS[(corner - k + 8) % 4]; };
    top.innerHTML = ''; bot.innerHTML = '';
    [at(0), at(1)].forEach(function (c) { top.appendChild(S.chips[c]); });
    [at(3), at(2)].forEach(function (c) { bot.appendChild(S.chips[c]); });
  }
  function rotationFor() {
    if (!prefs.rotate || !S.me) return 0;
    return (3 - L.COLORS.indexOf(S.me.color) + 4) % 4; // put the local colour at the bottom-left corner
  }
  function snapshot(st) {
    var o = {};
    st.players.forEach(function (p) { if (p && !p.left) o[p.color] = p.tokens.slice(); });
    return o;
  }
  /* ----- graphics tiers: 3D high / medium / low, or the 2D classic board ----- */
  function has3D() { return !!(window.Board3D && window.Board3D.supported()); }
  function detectGfx() {
    if (!has3D()) return 'classic';
    var ua = navigator.userAgent || '', mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 4;
    var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    if (!mobile) return 'high';
    if (mem && mem <= 3) return 'low';
    if (mem >= 6 || (!mem && cores >= 6)) return 'high';
    return 'medium';
  }
  function wantGfx() {
    if (S.forceClassic || !has3D()) return 'classic';
    var g = new URLSearchParams(location.search).get('gfx') || prefs.gfx || 'auto';
    if (g === 'auto') g = S.autoGfx || (S.autoGfx = detectGfx());
    return ['high', 'medium', 'low', 'classic'].indexOf(g) >= 0 ? g : 'high';
  }
  function onSlow() {
    if (prefs.gfx !== 'auto') return; // never override an explicit choice
    var order = ['high', 'medium', 'low', 'classic'], i = order.indexOf(S.gfx);
    if (i < 0 || i >= 3) return;
    S.autoGfx = order[i + 1];
    toast(T('gfxLowered'), 'warn');
    switchBoard();
  }
  function onLost() { S.forceClassic = true; toast(T('gfxFallback'), 'warn'); switchBoard(); }
  function wireBoard(b) {
    b.onPick = pick;
    b.onStep = function () { window.Sound.step(); };
    b.onCapture = function () { window.Sound.capture(); vibrate(60); };
    b.onFinish = function () { window.Sound.home(); };
    b.onIdle = renderControls;
    b.onDiceTap = function () { roll(); };
    return b;
  }
  function ensureBoard() {
    var mode = wantGfx(), theme = profile.style.theme;
    if (S.board && S.gfx === mode && S.boardTheme === theme) return;
    if (S.board && S.board.dispose) S.board.dispose();
    S.board = null;
    var b = null;
    if (mode !== 'classic') {
      try { b = new window.Board3D($('#board3d'), { quality: mode, theme: theme, skins: S.room ? skinMap(S.room) : {}, onSlow: onSlow, onLost: onLost }); }
      catch (e) { if (window.console) console.warn('3D board unavailable, using 2D:', e && e.message); b = null; mode = 'classic'; S.forceClassic = true; }
    }
    S.is3d = !!b;
    if (!b) { mode = 'classic'; b = new window.Board($('#board')); }
    S.gfx = mode; S.boardTheme = theme; S.board = wireBoard(b);
    $('.board-frame').classList.toggle('is3d', S.is3d);
    $('#screen-game').classList.toggle('gfx3d', S.is3d);
    // #board is an SVG element: it has no .hidden property, so use the attribute
    if (S.is3d) $('#board').setAttribute('hidden', ''); else $('#board').removeAttribute('hidden');
    $('#board3d').hidden = !S.is3d;
    if (!S.diceBuilt) { buildDice(); S.diceBuilt = true; }
  }
  function switchBoard() {
    ensureBoard();
    syncSettingsUI();
    if (S.room && S.me && S.screen === 'game') { S.rot = -1; renderGame(S.room, true); }
  }

  function enterGame(st) {
    ensureBoard();
    buildChips();
    S.rot = rotationFor();
    S.board.setRotation(S.rot, false);
    placeChips(S.rot);
    $('#g-code-text').textContent = st.code;
    S.lastRollId = st.rollId;
    S.lastActionId = st.action ? st.action.id : null;
    S.prevTurn = null;
    S.diceAnim = false;
    setDiceFace(st.dice || 1);
    show('game');
  }

  /* 3D dice */
  function buildDice() {
    var cube = $('#cube');
    cube.innerHTML = '';
    for (var v = 1; v <= 6; v++) {
      var f = document.createElement('div');
      f.className = 'face f' + v;
      for (var i = 0; i < 9; i++) { var p = document.createElement('i'); if (PIPS[v].indexOf(i) >= 0) p.className = 'on'; f.appendChild(p); }
      cube.appendChild(f);
    }
  }
  function orient(v, spin) {
    var cube = $('#cube'), o = ORI[v] || ORI[1];
    if (spin) S.spin++;
    cube.style.transition = spin ? 'transform .95s cubic-bezier(.15,.7,.25,1)' : 'none';
    cube.style.transform = 'rotateX(' + (o[0] + 720 * S.spin) + 'deg) rotateY(' + (o[1] + 1080 * S.spin) + 'deg)';
  }
  function rollerSkin() { var p = S.room && S.room.turn ? playerOf(S.room, S.room.turn) : null; return p && p.skin ? p.skin.dice : null; }
  function setDiceFace(v) { if (S.is3d) S.board.setDiceValue(v, rollerSkin()); else orient(v, false); }
  function animateDice(value) {
    if (S.is3d) { // physical 3D dice: throw it on the table, it lands on the server's value
      clearTimeout(S.diceTimer);
      S.diceAnim = true;
      window.Sound.rattle();
      var done = false;
      var fin = function () { if (done) return; done = true; clearTimeout(S.diceTimer); S.diceAnim = false; renderControls(); };
      S.board.onDiceBounce = function (seg) { window.Sound.thud(seg - 1); };
      S.board.rollDice(value, fin, rollerSkin());
      S.diceTimer = setTimeout(fin, 5000);
      return;
    }
    var dice = $('#dice');
    clearTimeout(S.diceTimer);
    S.diceAnim = true;
    dice.classList.add('rolling');
    window.Sound.dice();
    orient(value, true);
    S.diceTimer = setTimeout(function () {
      S.diceAnim = false;
      dice.classList.remove('rolling');
      renderControls();
    }, 1000);
  }

  function renderChips(st) {
    L.COLORS.forEach(function (c) {
      var chip = S.chips[c], p = playerOf(st, c);
      chip.classList.toggle('empty', !p);
      chip.classList.toggle('gone', !!(p && p.left));
      chip.classList.toggle('off', !!(p && !p.connected && !p.left));
      chip.classList.toggle('me', !!(p && S.me && c === S.me.color));
      chip.classList.toggle('auto', !!(p && p.auto && !p.bot));
      chip.setAttribute('data-tag', T('autoBadge'));
      var active = st.phase === 'playing' && st.turn === c;
      chip.classList.toggle('active', active);
      var av = $('.avatar', chip), nm = $('.chip-name', chip);
      if (!p) { av.textContent = '·'; av.style.setProperty('--ac', 'rgba(255,255,255,.15)'); nm.textContent = '—'; }
      else { setAvatar(av, p.avatar, c); nm.textContent = nameOf(st, p); }
      $$('.chip-pips i', chip).forEach(function (pip, i) { pip.classList.toggle('on', !!p && i < p.done); });
      // turn timer ring
      if (active && st.deadline && st.turnMs) {
        if (chip.getAttribute('data-dl') !== String(st.deadline)) {
          chip.setAttribute('data-dl', st.deadline);
          chip.classList.remove('counting', 'urgent');
          void chip.offsetWidth;
          var elapsed = Math.max(0, (Date.now() + S.clockOffset) - (st.deadline - st.turnMs));
          chip.style.setProperty('--dur', st.turnMs + 'ms');
          chip.style.setProperty('--delay', (-elapsed) + 'ms');
          chip.classList.add('counting');
        }
      } else { chip.classList.remove('counting', 'urgent'); chip.removeAttribute('data-dl'); }
    });
  }
  function tick() {
    var st = S.room;
    if (!st || S.screen !== 'game' || st.phase !== 'playing' || !st.deadline || !S.chips) return;
    var rem = st.deadline - (Date.now() + S.clockOffset);
    S.chips[st.turn].classList.toggle('urgent', rem < 6000 && rem > 0);
    if (S.me && st.turn === S.me.color && rem > 0 && rem <= 3200) {
      var sec = Math.ceil(rem / 1000);
      if (sec !== S.lastTick) { S.lastTick = sec; window.Sound.tick(); vibrate(15); }
    }
  }
  setInterval(tick, 300);

  function renderGame(st, isEnter) {
    var board = S.board;
    var k = rotationFor();
    if (k !== S.rot) { S.rot = k; board.setRotation(k, !isEnter); placeChips(k); }
    if (S.is3d && board.setSkins) board.setSkins(skinMap(st));
    board.update(snapshot(st), isEnter);
    board.setTurn(st.phase === 'playing' ? st.turn : null);
    renderChips(st);
    $('#g-code-text').textContent = st.code;
    $('#screen-game').style.setProperty('--pc', st.turn ? PAL[st.turn].main : '#fff');
    if (st.rollId !== S.lastRollId) {
      S.lastRollId = st.rollId;
      if (st.dice !== null) animateDice(st.dice);
    }
    if (st.action && st.action.id !== S.lastActionId) S.lastActionId = st.action.id;
    var myTurnNow = st.phase === 'playing' && S.me && st.turn === S.me.color && st.dice === null;
    if (myTurnNow && S.prevTurn !== S.me.color) { setTimeout(function () { window.Sound.turn(); vibrate(35); }, 350); }
    S.prevTurn = st.phase === 'playing' ? st.turn : null;
    renderControls();
  }

  function renderControls() {
    var st = S.room, board = S.board;
    if (!st || !board || S.screen !== 'game' || !S.me) return;
    var playing = st.phase === 'playing', mine = playing && st.turn === S.me.color;
    var busy = board.busy > 0;
    var canRoll = mine && st.dice === null && !S.rolling && !S.diceAnim && !busy && socket.connected;
    var btn = $('#btn-roll');
    btn.disabled = !canRoll;
    btn.classList.toggle('pulse', canRoll);
    $('#dice').disabled = !canRoll;
    if (S.is3d && board.setDiceActive) board.setDiceActive(canRoll ? window.Board3D.PAL[S.me.color].main : null);
    $('#dice').classList.toggle('idle', st.dice === null);
    $('#dice').classList.toggle('mine', mine);
    var canPick = mine && st.dice !== null && st.legal.length > 0 && !S.diceAnim && !busy && !S.moving;
    clearTimeout(S.autoPick);
    if (canPick) {
      board.setLegal(S.me.color, st.legal, st.dice);
      // single meaningful choice (or identical tokens): optionally play it automatically
      var mp = playerOf(st, S.me.color), same = st.legal.every(function (ti) { return mp.tokens[ti] === mp.tokens[st.legal[0]]; });
      if (prefs.autoMove && same) {
        var roll = st.rollId;
        S.autoPick = setTimeout(function () { if (S.room && S.room.rollId === roll && S.room.dice !== null && !S.moving) pick(S.me.color, st.legal[0]); }, 600);
      }
    } else board.clearLegal();

    var tp = playing ? playerOf(st, st.turn) : null, name = tp ? nameOf(st, tp) : '', msg;
    var a = st.action || {};
    if (!playing) msg = T('gameEnded');
    else if (S.diceAnim) msg = T('rolling');
    else if (st.dice === null) {
      if (a.bonus && a.color === st.turn && mine) msg = T('sixBonus');
      else if (mine) msg = T('yourTurn');
      else if (tp && !tp.connected) msg = T('offlineTurn', { name: name });
      else msg = T('turnOf', { name: name });
    } else if (a.type === 'triple') msg = T('tripleSix');
    else if (!st.legal.length) msg = T('noMove');
    else if (mine) msg = T('pickToken');
    else msg = T('turnOf', { name: name });
    $('#status').textContent = msg;
    $('#status').classList.toggle('mine', mine);
  }

  function roll() {
    if ($('#btn-roll').disabled) return;
    S.rolling = true; renderControls();
    request('game:roll', {}, { noLoader: true }).then(function (r) {
      S.rolling = false;
      if (!r.ok) { window.Sound.error(); toast(errText(r.error), 'bad'); }
      renderControls();
    });
  }
  function pick(color, i) {
    if (!S.me || color !== S.me.color || S.moving) return;
    S.moving = true;
    clearTimeout(S.autoPick);
    S.board.clearLegal();
    window.Sound.click();
    request('game:move', { token: i }, { noLoader: true }).then(function (r) {
      if (!r.ok) { S.moving = false; window.Sound.error(); toast(errText(r.error), 'bad'); renderControls(); }
    });
  }

  /* ---------- result & celebration ---------- */
  function confetti() {
    var box = $('#confetti'), cols = ['#ef4444', '#22c55e', '#fbbf24', '#3b82f6', '#fff', '#c084fc'];
    box.innerHTML = '';
    for (var i = 0; i < 70; i++) {
      var s = document.createElement('i');
      s.style.left = Math.random() * 100 + '%';
      s.style.background = cols[i % cols.length];
      s.style.animationDuration = (2.4 + Math.random() * 2.2) + 's';
      s.style.animationDelay = Math.random() * 0.8 + 's';
      s.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      s.style.setProperty('--rot', (360 + Math.random() * 720) + 'deg');
      box.appendChild(s);
    }
    setTimeout(function () { box.innerHTML = ''; }, 6000);
  }
  function scheduleResult(st) {
    if (S.resultShown) return;
    S.resultShown = true;
    (function wait() {
      if (!S.room || S.room.phase !== 'ended' || S.screen !== 'game') return;
      if (S.board && S.board.busy) return setTimeout(wait, 200);
      setTimeout(function () { if (S.room && S.room.phase === 'ended' && S.screen === 'game') showResult(S.room); }, 500);
    })();
    void st;
  }
  function progress(p) { return p.tokens.reduce(function (s, x) { return s + x + 1; }, 0); }
  function showResult(st) {
    var w = playerOf(st, st.winner);
    if (!w) return;
    var won = S.me && st.winner === S.me.color;
    setAvatar($('#res-avatar'), w.avatar, w.color);
    $('#res-title').textContent = T('winTitle', { name: nameOf(st, w) });
    $('#res-sub').textContent = won ? T('youWon') : (st.action && st.action.forfeit ? T('forfeitWin') : T('someoneWon'));
    $('#modal-result .sheet').style.setProperty('--c', PAL[w.color].main);
    var rows = st.players.filter(Boolean).sort(function (a, b) {
      return (b.color === st.winner ? 1e6 : 0) + progress(b) - ((a.color === st.winner ? 1e6 : 0) + progress(a));
    });
    var tbl = $('#res-table');
    tbl.innerHTML = '';
    rows.forEach(function (p, i) {
      var r = document.createElement('div'), av = document.createElement('span'), nm = document.createElement('span'), stt = document.createElement('span'), rk = document.createElement('span');
      r.className = 'res-row' + (p.color === st.winner ? ' win' : '');
      rk.className = 'res-rank'; rk.textContent = String(i + 1);
      av.className = 'avatar'; setAvatar(av, p.avatar, p.color);
      nm.className = 'res-name'; nm.textContent = nameOf(st, p);
      stt.className = 'res-stat';
      [['🏠', p.done + '/4', T('stHome')], ['⚔', p.stats.captures, T('stCaps')], ['🎲', p.stats.sixes, T('stSixes')]].forEach(function (x) {
        var s = document.createElement('span'); s.title = x[2]; s.appendChild(document.createTextNode(x[0] + ' ')); var b = document.createElement('b'); b.textContent = x[1]; s.appendChild(b); stt.appendChild(s);
      });
      r.appendChild(rk); r.appendChild(av); r.appendChild(nm); r.appendChild(stt); tbl.appendChild(r);
    });
    profile.games = (profile.games || 0) + 1;
    if (won) profile.wins = (profile.wins || 0) + 1;
    save('ludo.profile', profile); renderMenuStats();
    if (S.board && S.board.celebrate) S.board.celebrate(st.winner);
    openModal('modal-result');
    confetti();
    window.Sound.win();
    vibrate([80, 40, 80]);
  }

  /* ---------- private chat (room chat + whispers, free: plain Socket.IO, nothing stored on disk) ---------- */
  var CH = { list: [], unread: 0, to: null, muted: {} };
  function chatOn() { return !S.room || !S.room.settings || S.room.settings.chat !== false; }
  function chatOpen() { return isDocked() ? !$('#chat-dock').hidden : !$('#modal-chat').hidden; }
  function renderChatBadges() {
    $$('.chat-badge').forEach(function (b) { b.textContent = CH.unread > 9 ? '9+' : String(CH.unread); b.hidden = !CH.unread; });
  }
  function resetChat() { CH.list = []; CH.unread = 0; CH.to = null; CH.muted = {}; renderChatBadges(); if (chatOpen()) renderChat(); }
  function toggleMute(color, name) {
    CH.muted[color] = !CH.muted[color];
    toast(T(CH.muted[color] ? 'chatMuteOn' : 'chatMuteOff', { name: name }));
    renderChat();
  }
  function msgNode(m) {
    var mine = m._mine !== undefined ? m._mine : !!(S.me && m.from === S.me.color), muted = !mine && !!CH.muted[m.from];
    var d = document.createElement('div'), who = document.createElement(mine ? 'span' : 'button'), tx = document.createElement('div');
    d.className = 'msg' + (mine ? ' me' : '') + (m.to ? ' priv' : '') + (muted ? ' muted' : '');
    who.className = 'msg-who';
    who.textContent = m.name + (m.to ? ' · ' + (mine ? T('chatPrivTo', { name: m.toName }) : T('chatPrivFrom')) : '');
    if (!mine) { who.type = 'button'; who.addEventListener('click', function () { toggleMute(m.from, m.name); }); }
    tx.className = 'msg-text'; tx.setAttribute('dir', 'auto');
    tx.textContent = muted ? T('chatMuted') : m.text; // textContent only: messages can never inject HTML
    d.appendChild(who); d.appendChild(tx);
    return d;
  }
  function renderChatTo() {
    var box = $('#chat-to'), st = S.room;
    box.innerHTML = '';
    var targets = [];
    if (st && S.me) st.players.forEach(function (p) { if (p && !p.bot && !p.left && p.color !== S.me.color) targets.push(p); });
    if (CH.to && !targets.some(function (p) { return p.color === CH.to; })) CH.to = null; // whisper target left
    var mk = function (label, color) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.className = 'chip-to' + (CH.to === color ? ' on' : '') + (color ? ' priv' : '');
      b.addEventListener('click', function () { window.Sound.click(); CH.to = color; renderChat(); });
      box.appendChild(b);
    };
    mk(T('chatAll'), null);
    targets.forEach(function (p) { mk(nameOf(st, p), p.color); });
    box.hidden = !targets.length;
  }
  function renderChat() {
    var box = $('#chat-list'), st = S.room, on = chatOn();
    box.innerHTML = '';
    if (!CH.list.length) { var e = document.createElement('div'); e.className = 'chat-empty'; e.textContent = T('chatEmpty'); box.appendChild(e); }
    CH.list.forEach(function (m) { box.appendChild(msgNode(m)); });
    box.scrollTop = box.scrollHeight;
    $('#chat-input').disabled = !on; $('#btn-chat-send').disabled = !on; $('#chat-off').hidden = on;
    renderChatTo();
    var tp = CH.to && st ? playerOf(st, CH.to) : null;
    $('#chat-input').placeholder = tp ? T('chatWhisperTo', { name: nameOf(st, tp) }) : T('chatPh');
  }
  function openChat() {
    if (!S.me) return;
    CH.unread = 0; renderChatBadges();
    $('#emoji-panel').hidden = true;
    if (!isDocked()) openModal('modal-chat');
    renderChat();
    if (!('ontouchstart' in window) && chatOn()) setTimeout(function () { $('#chat-input').focus(); }, 250); // no auto-keyboard on phones
  }
  function sendChat() {
    var inp = $('#chat-input'), text = inp.value.trim();
    if (!text || !chatOn()) return;
    var d = { text: text };
    if (CH.to) d.to = CH.to;
    request('chat:send', d, { noLoader: true }).then(function (r) {
      if (r.ok) inp.value = '';
      else { window.Sound.error(); toast(errText(r.error), 'bad'); }
    });
  }
  function onChatMsg(m) {
    if (!S.me || CH.list.some(function (x) { return x.id === m.id; })) return;
    m._mine = m.from === S.me.color;
    CH.list.push(m);
    if (CH.list.length > 80) CH.list.shift();
    var muted = !m._mine && CH.muted[m.from];
    if (chatOpen()) { renderChat(); return; }
    if (m._mine || muted) return;
    CH.unread++; renderChatBadges();
    if (!(prefs.feed && showFeed(m))) toast(m.name + (m.to ? ' (' + T('chatPrivFrom') + ')' : '') + ': ' + (m.text.length > 46 ? m.text.slice(0, 46) + '…' : m.text), 'chat');
    window.Sound.pop();
  }

  /* ---------- reactions & quick chat ---------- */
  var EMO_TAB = 'faces';
  function sendEmoji(e) {
    $('#emoji-panel').hidden = true;
    request('game:emoji', { emoji: e }, { noLoader: true }).then(function (r) { if (!r.ok && r.error !== 'RATE') toast(errText(r.error), 'bad'); });
  }
  function sendPhrase(id) {
    $('#emoji-panel').hidden = true;
    request('game:chat', { id: id }, { noLoader: true }).then(function (r) { if (!r.ok && r.error !== 'RATE') toast(errText(r.error), 'bad'); });
  }
  function buildEmojiPanel() {
    var p = $('#emoji-panel'), tabs = document.createElement('div'), body = document.createElement('div');
    p.innerHTML = '';
    tabs.className = 'emo-tabs';
    var showTab = function (id) {
      EMO_TAB = id;
      $$('.emo-tab', tabs).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-cat') === id); });
      body.innerHTML = '';
      if (id === 'phrases') {
        body.className = 'emo-phrases';
        for (var i = 0; i < CAT.QUICK_CHAT; i++) (function (cid) {
          var b = document.createElement('button');
          b.type = 'button'; b.textContent = T('chat' + cid);
          b.addEventListener('click', function () { sendPhrase(cid); });
          body.appendChild(b);
        })(i);
      } else {
        body.className = 'emo-grid';
        CAT.EMOJI_CATS.filter(function (c) { return c.id === id; })[0].list.forEach(function (e) {
          var b = document.createElement('button');
          b.type = 'button'; b.textContent = e; b.setAttribute('aria-label', e);
          b.addEventListener('click', function () { sendEmoji(e); });
          body.appendChild(b);
        });
      }
    };
    CAT.EMOJI_CATS.concat([{ id: 'phrases', icon: '💬' }]).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'emo-tab'; b.setAttribute('data-cat', c.id); b.textContent = c.icon;
      b.setAttribute('aria-label', c.id === 'phrases' ? T('phrasesTab') : c.id);
      b.addEventListener('click', function () { window.Sound.click(); showTab(c.id); });
      tabs.appendChild(b);
    });
    p.appendChild(tabs); p.appendChild(body);
    var co = document.createElement('button');
    co.type = 'button'; co.className = 'chat-open';
    co.innerHTML = '<svg class="ic"><use href="#i-chat"/></svg><span></span><span class="chat-badge" hidden></span>';
    co.children[1].textContent = T('chatOpen');
    co.addEventListener('click', function () { window.Sound.click(); openChat(); });
    p.appendChild(co);
    showTab(EMO_TAB);
    renderChatBadges();
  }
  function anchorRect(color) {
    var a = S.screen === 'game' && S.chips ? S.chips[color] : $('.slot[data-color="' + color + '"]');
    return a ? a.getBoundingClientRect() : null;
  }
  // Burst / rain effects: a shower of copies of the emoji around the sender
  function particles(text, cx, cy, kind) {
    var layer = $('#reaction-layer'), n = kind === 'burst' ? 10 : 12;
    for (var i = 0; i < n; i++) {
      var sp = document.createElement('span'), a = i * Math.PI * 2 / n + Math.random() * 0.4, dx, dy;
      sp.className = 'fxp ' + kind; sp.textContent = text;
      sp.style.left = cx + 'px'; sp.style.top = cy + 'px';
      if (kind === 'burst') { var rad = 70 + Math.random() * 60; dx = Math.cos(a) * rad; dy = Math.sin(a) * rad; }
      else { dx = (Math.random() - 0.5) * 170; dy = 120 + Math.random() * 200; }
      sp.style.setProperty('--dx', dx + 'px'); sp.style.setProperty('--dy', dy + 'px'); sp.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
      sp.style.animationDelay = (kind === 'rain' ? Math.random() * 0.5 : 0) + 's';
      layer.appendChild(sp);
      (function (n2) { setTimeout(function () { if (n2.parentNode) n2.parentNode.removeChild(n2); }, 2600); })(sp);
    }
  }
  function floatBubble(color, text, chat, effect) {
    var r = anchorRect(color);
    if (!r) return;
    var layer = $('#reaction-layer');
    while (layer.children.length >= 40) layer.removeChild(layer.firstChild);
    var b = document.createElement('div'), isTop = r.top < window.innerHeight / 2;
    var cx = Math.min(Math.max(r.left + r.width / 2, 60), window.innerWidth - 60), cy = isTop ? r.top : r.bottom;
    // float away from the board: top chips drift up, bottom chips drift down
    b.className = 'react ' + (chat ? 'chatb ' : '') + (effect === 'shake' ? 'shake ' : '') + (effect === 'burst' || effect === 'rain' ? 'big ' : '') + (isTop ? 'up' : 'down');
    if (effect === 'spin') { var em = document.createElement('span'); em.className = 'em'; em.textContent = text; b.classList.add('spin'); b.appendChild(em); }
    else b.textContent = text;
    b.style.left = cx + 'px'; b.style.top = cy + 'px';
    layer.appendChild(b);
    if (effect === 'burst' || effect === 'rain') particles(text, cx, cy, effect);
    window.Sound.pop();
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 2300);
  }

  /* ---------- live chat on screen: feed (phones) and docked panel (wide screens) ---------- */
  var WIDE = window.matchMedia ? window.matchMedia('(min-width: 1180px) and (min-height: 620px)') : null;
  function isDocked() { return !!(WIDE && WIDE.matches); }
  function placeChat() {
    var dock = $('#chat-dock'), sheet = $('.chat-sheet'), modal = $('#modal-chat');
    if (!dock || !sheet) return;
    if (isDocked()) {
      if (sheet.parentNode !== dock) dock.appendChild(sheet);
      dock.hidden = !(S.me && (S.screen === 'game' || S.screen === 'lobby'));
      if (!modal.hidden) { modal.classList.remove('open'); modal.hidden = true; }
      if (!dock.hidden) renderChat();
    } else {
      if (sheet.parentNode !== modal) modal.appendChild(sheet);
      dock.hidden = true;
    }
  }
  function showFeed(m) {
    if (isDocked() || chatOpen() || (S.screen !== 'game' && S.screen !== 'lobby')) return false;
    var box = $('#chat-feed'), st = S.room, p = st ? playerOf(st, m.from) : null;
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    var d = document.createElement('div'), av = document.createElement('span'), body = document.createElement('div'), who = document.createElement('span'), tx = document.createElement('span');
    var life = 4 + Math.min(5, m.text.length * 0.06);
    d.className = 'feed-item' + (m.to ? ' priv' : '');
    d.style.setProperty('--c', PAL[m.from] ? PAL[m.from].main : '#fff'); d.style.setProperty('--life', life + 's');
    av.className = 'avatar'; setAvatar(av, p ? p.avatar : 0, m.from);
    body.className = 'feed-body'; who.className = 'feed-who'; tx.className = 'feed-text'; tx.setAttribute('dir', 'auto');
    who.textContent = m.name + (m.to ? ' · ' + T('chatPrivFrom') : ''); tx.textContent = m.text;
    body.appendChild(who); body.appendChild(tx); d.appendChild(av); d.appendChild(body);
    d.addEventListener('click', function () { openChat(); });
    box.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, life * 1000 + 600);
    return true;
  }
  function buildChatEmoji() {
    var box = $('#chat-emoji');
    box.innerHTML = '';
    CAT.EMOJIS.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = e; b.setAttribute('aria-label', e);
      b.addEventListener('click', function () {
        var inp = $('#chat-input');
        if (inp.disabled) return;
        inp.setRangeText(e, inp.selectionStart == null ? inp.value.length : inp.selectionStart, inp.selectionEnd == null ? inp.value.length : inp.selectionEnd, 'end');
        inp.focus();
      });
      box.appendChild(b);
    });
  }

  /* ---------- customize: board themes, pawn skins, dice skins (live 3D preview) ---------- */
  var ST = { tab: 'board', from: 'menu', timer: null, preview: null };
  var THEME_SW = { classic: ['#4c3fc0', '#fffaf0'], wood: ['#8b5a2b', '#f6e7c4'], neon: ['#00e5ff', '#0a0c28'], royal: ['#d4a017', '#6d1022'], ocean: ['#35d6dd', '#0e5a6b'], desert: ['#e0a458', '#8a5a2b'] };
  var DICE_SW = { ivory: ['#ffffff', '#2a2550'], ruby: ['#c91f33', '#ffffff'], onyx: ['#17171f', '#ffd36a'], ice: ['#bfe6ff', '#2d6fa8'], neon: ['#0a0a22', '#7df9ff'], wood: ['#a66a2f', '#fff2d2'] };
  var PAWN_GLYPH = { classic: '\u265F\uFE0E', crown: '\u265B\uFE0E', gem: '\u25C6', orb: '\u25CF', rook: '\u265C\uFE0E' };
  var DEMO_SNAP = { red: [-1, 5, 12, 20], green: [-1, -1, 18, 30], yellow: [3, -1, 40, 26], blue: [-1, 51, 16, 33] };
  function mySkin() { return { pawn: profile.style.pawn, finish: profile.style.finish, dice: profile.style.dice }; }
  function skinMap(st) {
    var m = {};
    st.players.forEach(function (p) { if (p) m[p.color] = p.skin || CAT.DEFAULT_SKIN; });
    return m;
  }
  function syncSkin() { if (S.me && S.room && S.room.phase === 'lobby') request('room:skin', { skin: mySkin() }, { noLoader: true }); }
  function optCard(label, sw, on, fn) {
    var b = document.createElement('button'), l = document.createElement('span');
    b.type = 'button'; b.className = 'opt' + (on ? ' on' : '');
    l.textContent = label; b.appendChild(sw); b.appendChild(l);
    b.addEventListener('click', function () { window.Sound.click(); fn(); });
    return b;
  }
  function mkSwatch(cls, text, vars) {
    var s = document.createElement('span');
    s.className = 'swatch ' + cls;
    if (text) s.textContent = text;
    Object.keys(vars || {}).forEach(function (k) { s.style.setProperty(k, vars[k]); });
    return s;
  }
  function renderStyle() {
    $$('#style-tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === ST.tab); });
    var box = $('#style-options'), grid, label;
    box.innerHTML = '';
    var group = function (title) { if (title) { label = document.createElement('div'); label.className = 'opt-group'; label.textContent = title; box.appendChild(label); } grid = document.createElement('div'); grid.className = 'opt-grid'; box.appendChild(grid); };
    if (ST.tab === 'board') {
      group(null);
      CAT.THEMES.forEach(function (id) { grid.appendChild(optCard(T('t.' + id), mkSwatch('sw-theme', '', { '--a': THEME_SW[id][0], '--b': THEME_SW[id][1] }), profile.style.theme === id, function () { setStyle('theme', id); })); });
    } else if (ST.tab === 'pawn') {
      group(T('groupShape'));
      CAT.PAWNS.forEach(function (id) { grid.appendChild(optCard(T('p.' + id), mkSwatch('sw-pawn', PAWN_GLYPH[id]), profile.style.pawn === id, function () { setStyle('pawn', id); })); });
      group(T('groupFinish'));
      CAT.FINISHES.forEach(function (id) { grid.appendChild(optCard(T('f.' + id), mkSwatch('circle fin-' + id), profile.style.finish === id, function () { setStyle('finish', id); })); });
    } else {
      group(null);
      CAT.DICES.forEach(function (id) { grid.appendChild(optCard(T('d.' + id), mkSwatch('sw-dice', '\u2685', { '--b': DICE_SW[id][0], '--p': DICE_SW[id][1] }), profile.style.dice === id, function () { setStyle('dice', id); })); });
    }
  }
  function setStyle(key, val) {
    if (profile.style[key] === val) return;
    profile.style[key] = val;
    save('ludo.profile', profile);
    renderStyle();
    schedulePreview();
    if (key !== 'theme') syncSkin();
  }
  function stopPreview() {
    clearTimeout(ST.timer);
    if (ST.preview) { ST.preview.dispose(); ST.preview = null; }
  }
  function startPreview() {
    stopPreview();
    var fb = $('#style-fallback');
    if (!has3D() || S.screen !== 'style') { fb.hidden = has3D(); return; }
    fb.hidden = true;
    var g = wantGfx(), sk = { pawn: profile.style.pawn, finish: profile.style.finish };
    try {
      ST.preview = new window.Board3D($('#style-preview'), { quality: g === 'high' || g === 'medium' ? 'medium' : 'low', theme: profile.style.theme, skins: { red: sk, green: sk, yellow: sk, blue: sk }, diceSkin: profile.style.dice, demo: true });
      ST.preview.update(DEMO_SNAP, true);
      ST.preview.setTurn('red');
      ST.preview.setDiceValue(5);
    } catch (e) { ST.preview = null; fb.hidden = false; }
  }
  function schedulePreview() { clearTimeout(ST.timer); ST.timer = setTimeout(startPreview, 140); }
  function openStyle(from) { ST.from = from; show('style'); renderStyle(); startPreview(); }
  function closeStyle() {
    stopPreview();
    if (ST.from === 'lobby' && S.room && S.me && S.room.phase === 'lobby') { show('lobby'); renderLobby(); } else show('menu');
  }

  /* ---------- settings ---------- */
  function syncSettingsUI() {
    ['#btn-sound use', '#btn-g-sound use'].forEach(function (s) { $(s).setAttribute('href', prefs.sfx ? '#i-sound' : '#i-mute'); });
    $('#tg-sfx').setAttribute('aria-checked', String(prefs.sfx));
    $('#tg-music').setAttribute('aria-checked', String(prefs.music));
    $('#tg-auto').setAttribute('aria-checked', String(prefs.autoMove));
    $('#tg-rot').setAttribute('aria-checked', String(prefs.rotate));
    $('#tg-feed').setAttribute('aria-checked', String(prefs.feed));
    $('#lang-ar').classList.toggle('on', prefs.lang === 'ar');
    $('#lang-en').classList.toggle('on', prefs.lang === 'en');
    $$('#seg-gfx button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-gfx') === (prefs.gfx || 'auto')); });
    var note = $('#gfx-note');
    if (note) note.textContent = has3D() ? '' : T('gfxNote2d');
  }
  function applyLang() {
    window.I18N.setLang(prefs.lang);
    syncSettingsUI(); renderMenuStats(); buildEmojiPanel();
    if (S.screen === 'style') renderStyle();
    if (chatOpen()) renderChat();
    renderCreateColors(); renderJoinColors();
    if ($('#inp-code').value.trim().length === 5) peekCode();
    if (S.room && S.me) {
      if (S.screen === 'lobby') renderLobby();
      if (S.screen === 'game') { renderChips(S.room); renderControls(); }
    }
  }
  function togglePref(key, after) {
    prefs[key] = !prefs[key]; save('ludo.prefs', prefs); syncSettingsUI();
    if (after) after();
    window.Sound.click();
  }
  function toggleSfx() { togglePref('sfx', function () { window.Sound.setSfx(prefs.sfx); }); }

  /* ---------- wiring ---------- */
  function wire() {
    document.addEventListener('pointerdown', function once() { window.Sound.unlock(); document.removeEventListener('pointerdown', once); });
    $$('[data-nav]').forEach(function (b) { b.addEventListener('click', function () { window.Sound.click(); show(b.getAttribute('data-nav')); }); });
    $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { window.Sound.click(); closeModals(); }); });
    $$('.modal').forEach(function (m) { m.addEventListener('pointerdown', function (e) { if (e.target === m && m.id !== 'modal-result') closeModals(); }); });

    $$('#inp-name, .name-input').forEach(function (i) {
      i.addEventListener('input', function () { profile.name = i.value.slice(0, 14); save('ludo.profile', profile); $$('#inp-name, .name-input').forEach(function (o) { if (o !== i) o.value = profile.name; }); });
    });
    var grid = $('#avatar-grid');
    grid.classList.add('many');
    AVATARS.forEach(function (a, i) {
      if (i === CAT.BOT_AVATAR) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'avatar-opt'; b.textContent = a;
      b.addEventListener('click', function () { profile.avatar = i; save('ludo.profile', profile); syncProfileUI(); window.Sound.click(); closeModals(); });
      grid.appendChild(b);
    });
    $$('#btn-avatar-menu, [data-avatar-open]').forEach(function (b) { b.addEventListener('click', function () { window.Sound.click(); openModal('modal-avatar'); }); });

    $('#btn-play').addEventListener('click', createRoom);
    $('#btn-create').addEventListener('click', function () { window.Sound.click(); renderCreateColors(); show('create'); });
    $('#btn-join').addEventListener('click', function () { window.Sound.click(); S.joinTaken = []; renderJoinColors(); show('join'); });
    $('#btn-create-go').addEventListener('click', createRoom);
    $('#btn-join-go').addEventListener('click', joinRoom);
    $('#inp-code').addEventListener('input', function (e) {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      peekCode();
    });
    $('#inp-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom(); });

    $('#btn-lobby-leave').addEventListener('click', function () { window.Sound.click(); leaveRoom(); });
    $('#btn-copy').addEventListener('click', function () { copyText(S.room.code).then(function () { toast(T('copied'), 'good'); }, function () { toast(S.room.code); }); });
    $('#lobby-code').addEventListener('click', function () { $('#btn-copy').click(); });
    $('#g-code').addEventListener('click', function () { copyText(S.room.code).then(function () { toast(T('copied'), 'good'); }, function () { toast(S.room.code); }); });
    $('#btn-share').addEventListener('click', function () {
      var code = S.room.code, link = inviteLink(code);
      if (navigator.share) navigator.share({ title: 'Ludo Party', text: T('shareText', { code: code }), url: link }).catch(function () { /* cancelled */ });
      else copyText(link).then(function () { toast(T('linkCopied'), 'good'); }, function () { toast(link); });
    });
    $('#btn-ready').addEventListener('click', function () {
      window.Sound.click();
      var p = playerOf(S.room, S.me.color);
      request('room:ready', { ready: !(p && p.ready) }, { noLoader: true }).then(function (r) { if (!r.ok) toast(errText(r.error), 'bad'); });
    });
    $('#btn-start').addEventListener('click', function () {
      window.Sound.click();
      request('game:start', {}).then(function (r) { if (!r.ok) { window.Sound.error(); toast(errText(r.error), 'bad'); } });
    });
    $('#btn-addbot').addEventListener('click', function () {
      window.Sound.click();
      request('room:addBot', {}, { noLoader: true }).then(function (r) { if (!r.ok) toast(errText(r.error), 'bad'); });
    });
    $$('#seg-timer button').forEach(function (b) {
      b.addEventListener('click', function () { window.Sound.click(); request('room:settings', { timer: +b.getAttribute('data-t') }, { noLoader: true }).then(function (r) { if (!r.ok) toast(errText(r.error), 'bad'); }); });
    });
    [['#rs-cap', 'bonusCapture'], ['#rs-home', 'bonusHome'], ['#rs-chat', 'chat']].forEach(function (x) {
      $(x[0]).addEventListener('click', function () {
        if (!S.room) return;
        var d = {}; d[x[1]] = x[1] === 'chat' ? !chatOn() : !S.room.settings[x[1]];
        window.Sound.click();
        request('room:settings', d, { noLoader: true }).then(function (r) { if (!r.ok) toast(errText(r.error), 'bad'); });
      });
    });

    $('#btn-lobby-chat').addEventListener('click', function () { window.Sound.click(); openChat(); });
    $('#btn-chat-send').addEventListener('click', sendChat);
    $('#chat-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
    $('#btn-roll').addEventListener('click', roll);
    $('#dice').addEventListener('click', roll);
    $('#btn-emoji').addEventListener('click', function (e) { e.stopPropagation(); window.Sound.click(); var p = $('#emoji-panel'); p.hidden = !p.hidden; });
    document.addEventListener('pointerdown', function (e) {
      var p = $('#emoji-panel');
      if (!p.hidden && !p.contains(e.target) && !$('#btn-emoji').contains(e.target)) p.hidden = true;
    });
    $('#btn-g-exit').addEventListener('click', function () { window.Sound.click(); openModal('modal-exit'); });
    $('#btn-exit-yes').addEventListener('click', leaveRoom);
    $('#btn-res-exit').addEventListener('click', leaveRoom);
    $('#btn-again').addEventListener('click', function () {
      window.Sound.click();
      $('#modal-result').classList.remove('open'); $('#modal-result').hidden = true;
      request('game:again', {}, { noLoader: true });
    });

    ['#btn-settings', '#btn-g-settings', '#btn-lobby-settings'].forEach(function (s) { $(s).addEventListener('click', function () { window.Sound.click(); syncSettingsUI(); openModal('modal-settings'); }); });
    $('#btn-help').addEventListener('click', function () { window.Sound.click(); openModal('modal-help'); });
    $('#btn-sound').addEventListener('click', toggleSfx);
    $('#btn-g-sound').addEventListener('click', toggleSfx);
    $('#tg-sfx').addEventListener('click', toggleSfx);
    $('#tg-music').addEventListener('click', function () { togglePref('music', function () { window.Sound.setMusic(prefs.music); }); });
    $('#tg-auto').addEventListener('click', function () { togglePref('autoMove', function () { renderControls(); }); });
    $('#tg-rot').addEventListener('click', function () { togglePref('rotate', function () { if (S.screen === 'game' && S.room) renderGame(S.room, false); }); });
    $('#tg-feed').addEventListener('click', function () { togglePref('feed'); });
    $('#btn-style').addEventListener('click', function () { window.Sound.click(); openStyle('menu'); });
    $('#btn-lobby-style').addEventListener('click', function () { window.Sound.click(); openStyle('lobby'); });
    $('#btn-style-back').addEventListener('click', function () { window.Sound.click(); closeStyle(); });
    $$('#style-tabs button').forEach(function (b) { b.addEventListener('click', function () { window.Sound.click(); ST.tab = b.getAttribute('data-tab'); renderStyle(); }); });
    $('#btn-chat-g').addEventListener('click', function () { window.Sound.click(); openChat(); });
    $('#btn-chat-emoji').addEventListener('click', function () { window.Sound.click(); var ce = $('#chat-emoji'); ce.hidden = !ce.hidden; });
    window.addEventListener('resize', placeChat);
    $$('#seg-gfx button').forEach(function (b) {
      b.addEventListener('click', function () {
        window.Sound.click();
        prefs.gfx = b.getAttribute('data-gfx'); S.autoGfx = null; S.forceClassic = false;
        save('ludo.prefs', prefs); syncSettingsUI();
        if (S.screen === 'game') switchBoard();
      });
    });
    $$('[data-lang]').forEach(function (b) { b.addEventListener('click', function () { prefs.lang = b.getAttribute('data-lang'); save('ludo.prefs', prefs); applyLang(); window.Sound.click(); }); });

    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !socket.connected) socket.connect(); });
  }

  /* ---------- socket events ---------- */
  function banner(text, on) { $('#net-text').textContent = text; $('#net-banner').hidden = !on; $('#app').classList.toggle('offline', !!on); }
  socket.on('connect', function () {
    S.connected = true;
    var was = S.wasDown;
    S.wasDown = false;
    banner('', false);
    if (was) toast(T('netBack'), 'good');
    S.everConnected = true;
    tryRejoin();
    renderControls();
  });
  socket.on('disconnect', function () {
    S.connected = false; S.wasDown = true; S.moving = false; S.rolling = false;
    banner(T('netLost'), true);
    renderControls();
  });
  socket.on('connect_error', function () { banner(S.everConnected ? T('netLost') : T('connecting'), true); });
  socket.on('room:state', handleState);
  socket.on('room:notice', function (n) {
    if (S.me && n.color === S.me.color && (n.key === 'joined' || n.key === 'back')) return;
    var nm = n.bot && S.room ? nameOf(S.room, playerOf(S.room, n.color)) || n.name : n.name;
    toast(T('n.' + n.key, { name: nm }), n.key === 'disc' || n.key === 'left' || n.key === 'autopilot' ? 'warn' : 'good');
  });
  socket.on('game:emoji', function (e) { floatBubble(e.color, e.emoji, false, CAT.effectOf(e.emoji)); });
  socket.on('chat:msg', onChatMsg);
  socket.on('chat:history', function (list) {
    if (!S.me || !Array.isArray(list)) return;
    CH.list = list.map(function (m) { m._mine = m.from === S.me.color; return m; });
    if (chatOpen()) renderChat();
  });
  socket.on('game:chat', function (m) { floatBubble(m.color, T('chat' + m.id), true); });

  // test hook (only with ?debug=1): lets automated tests find on-screen positions of 3D objects
  if (/[?&]debug=1/.test(location.search)) window.__ludo = { S: S };

  /* ---------- boot ---------- */
  window.Sound.setSfx(prefs.sfx);
  window.Sound.setMusic(prefs.music);
  window.I18N.setLang(prefs.lang);
  buildEmojiPanel();
  buildChatEmoji();
  syncProfileUI();
  renderCreateColors();
  renderJoinColors();
  syncSettingsUI();
  wire();
  banner(T('connecting'), true);

  var params = new URLSearchParams(location.search), linkCode = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (linkCode.length === 5 && !loadSession()) {
    $('#inp-code').value = linkCode;
    show('join');
    peekCode();
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  }
})();
