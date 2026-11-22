'use strict';
/*
 * Ludo Party – authoritative game server.
 * The server owns all game state: clients only send intents (roll / move / ...)
 * and the server validates membership, turn, dice and move legality.
 */
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const L = require('./shared/ludo');

const PORT = process.env.PORT || 3000;
const FAST = process.env.LUDO_FAST === '1'; // shortens delays (used by tests only)
const UNIT = FAST ? 20 : 1000;              // one "timer second" in ms
const T = {
  pass: FAST ? 15 : 1500,        // pause before an unplayable turn is skipped
  autoRoll: FAST ? 40 : 7000,    // grace before auto-playing for a disconnected player
  autoMove: FAST ? 20 : 1300,
  botRoll: FAST ? 25 : 1200,     // bots / auto-pilot "thinking" time
  botMove: FAST ? 20 : 1300,
  lobbyDrop: FAST ? 400 : 25000  // seat kept this long after a lobby disconnect
};
const TIMERS = [0, 15, 30, 45];
const DEFAULT_TIMER = FAST ? 0 : 30;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMOJIS = ['😂', '😎', '😡', '😱', '😭', '🤯', '👏', '🔥', '👑', '🏁', '🤡', '💀'];
const QUICK_CHAT = 6;
const CHAT_MAX = 200, CHAT_KEEP = 60;
const AVATARS = 12;

const rooms = new Map();
const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/shared', express.static(path.join(__dirname, 'shared'), { maxAge: '1h' }));
app.get('/healthz', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });

/* ---------- helpers ---------- */
const ack = (cb) => (typeof cb === 'function' ? cb : () => {});
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const normCode = (c) => clean(c, 8).toUpperCase();
const seated = (r) => L.COLORS.filter((c) => r.players[c]);
const active = (r) => seated(r).filter((c) => !r.players[c].left);
const humans = (r) => active(r).filter((c) => !r.players[c].bot);
const automated = (p) => !!p && (p.bot || p.auto || !p.connected);
// Chat text: collapse whitespace, drop control chars and invisible bidi/zero-width characters (RTL spoofing), cap the length.
const cleanChat = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ')
  .replace(/[\u0000-\u001f\u007f<>\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').trim().slice(0, CHAT_MAX);
const newStats = () => ({ rolls: 0, sixes: 0, moves: 0, captures: 0, captured: 0 });

function genCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

function readProfile(d) {
  d = d || {};
  const avatar = d.avatar == null ? 0 : d.avatar;
  if (!Number.isInteger(avatar) || avatar < 0 || avatar >= AVATARS) return null;
  if (d.color != null && !L.COLORS.includes(d.color)) return null;
  return { name: clean(d.name, 14), avatar, color: d.color || null };
}

function publicState(r) {
  return {
    code: r.code, phase: r.phase, host: r.host, turn: r.turn, dice: r.dice,
    rollId: r.rollId, legal: r.legal, winner: r.winner, action: r.action,
    settings: r.settings, turnMs: r.settings.timer * UNIT, deadline: r.deadline, now: Date.now(),
    players: L.COLORS.map((c) => {
      const p = r.players[c];
      if (!p) return null;
      return {
        color: c, name: p.name, avatar: p.avatar, bot: !!p.bot, auto: !!p.auto,
        connected: p.bot ? true : p.connected, left: !!p.left,
        ready: c === r.host || p.ready, tokens: p.tokens,
        done: p.tokens.filter((x) => x === L.FINISH).length, stats: p.stats
      };
    })
  };
}

function broadcast(r) { r.last = Date.now(); io.to(r.code).emit('room:state', publicState(r)); }
function sync(r) { schedule(r); broadcast(r); } // (re)arm timers first so the deadline is part of the state
function notice(r, key, p) { io.to(r.code).emit('room:notice', { key, name: p ? p.name : '', color: p ? p.color : null, bot: !!(p && p.bot) }); }
function setAction(r, a) { r.actionId++; r.action = Object.assign({ id: r.actionId }, a); }

function clearTimer(r) { if (r.timer) clearTimeout(r.timer); r.timer = null; r.timerKind = null; r.deadline = null; }
function setTimer(r, kind, ms, fn) {
  if (r.timer) clearTimeout(r.timer);
  r.timerKind = kind;
  r.timer = setTimeout(() => { r.timer = null; r.timerKind = null; r.deadline = null; fn(); }, ms);
}

function destroyRoom(r) {
  clearTimer(r);
  seated(r).forEach((c) => clearTimeout(r.players[c].dropTimer));
  rooms.delete(r.code);
}

function newRoom() {
  return {
    code: genCode(), players: {}, host: null, phase: 'lobby', turn: null, dice: null, legal: [],
    rollId: 0, actionId: 0, action: null, sixes: 0, winner: null, last: Date.now(),
    timer: null, timerKind: null, timerKey: null, deadline: null,
    settings: { timer: DEFAULT_TIMER, bonusCapture: true, bonusHome: true, chat: true },
    chatLog: [], chatSeq: 0
  };
}

function mkPlayer(color, name, avatar, sid, bot) {
  return {
    pid: crypto.randomBytes(12).toString('hex'), sid, color, name: name || 'Player', avatar,
    ready: !!bot, connected: true, bot: !!bot, auto: false, strikes: 0,
    tokens: [-1, -1, -1, -1], left: false, dropTimer: null, lastEmoji: 0, stats: newStats()
  };
}

function addPlayer(r, socket, prof, color) {
  const p = mkPlayer(color, prof.name, prof.avatar, socket.id, false);
  r.players[color] = p;
  socket.data.code = r.code;
  socket.data.color = color;
  socket.join(r.code);
  return p;
}

function ctxOf(socket) {
  const r = rooms.get(socket.data.code);
  const p = r && r.players[socket.data.color];
  if (!p || p.sid !== socket.id) return null;
  return { r, p };
}

/* ---------- game flow ---------- */
function nextColor(r, from) {
  const i = L.COLORS.indexOf(from);
  for (let k = 1; k <= 4; k++) {
    const c = L.COLORS[(i + k) % 4];
    if (r.players[c] && !r.players[c].left) return c;
  }
  return from;
}

function advance(r) {
  r.turn = nextColor(r, r.turn);
  r.dice = null; r.legal = []; r.sixes = 0;
}

function startGame(r) {
  clearTimer(r);
  seated(r).forEach((c) => {
    const p = r.players[c];
    p.tokens = [-1, -1, -1, -1]; p.auto = false; p.strikes = 0; p.stats = newStats();
  });
  const order = active(r);
  r.phase = 'playing';
  r.turn = order[crypto.randomInt(order.length)];
  r.dice = null; r.legal = []; r.sixes = 0; r.winner = null; r.rollId = 0; r.timerKey = null;
  setAction(r, { type: 'start', color: r.turn });
  sync(r);
}

function passTurn(r) {
  if (r.phase !== 'playing') return;
  advance(r);
  setAction(r, { type: 'turn', color: r.turn });
  sync(r);
}

function doRoll(r, p) {
  clearTimer(r);
  const n = 1 + crypto.randomInt(6);
  r.rollId++;
  r.dice = n;
  r.sixes = n === 6 ? r.sixes + 1 : 0;
  p.stats.rolls++;
  if (n === 6) p.stats.sixes++;
  if (n === 6 && r.sixes >= 3) { // three sixes in a row forfeit the turn
    r.legal = []; r.sixes = 0;
    setAction(r, { type: 'triple', color: p.color, dice: n });
    setTimer(r, 'pass', T.pass + 300, () => passTurn(r));
    broadcast(r);
    return;
  }
  r.legal = L.legalMoves(p.tokens, n);
  if (!r.legal.length) {
    setAction(r, { type: 'nomove', color: p.color, dice: n });
    setTimer(r, 'pass', T.pass, () => passTurn(r));
    broadcast(r);
    return;
  }
  setAction(r, { type: 'roll', color: p.color, dice: n });
  sync(r);
}

function doMove(r, p, ti) {
  clearTimer(r);
  const roll = r.dice;
  const res = L.moveToken(r.players, p.color, ti, roll);
  r.dice = null; r.legal = [];
  const captured = res.captured.map((c) => ({ color: c.color, token: c.token }));
  p.stats.moves++;
  p.stats.captures += captured.length;
  captured.forEach((c) => { r.players[c.color].stats.captured++; });
  if (p.tokens.every((x) => x === L.FINISH)) {
    r.phase = 'ended'; r.winner = p.color;
    setAction(r, { type: 'win', color: p.color, token: ti, from: res.from, to: res.to, captured, dice: roll });
    sync(r);
    return;
  }
  const extra = roll === 6 || (captured.length > 0 && r.settings.bonusCapture) || (res.finished && r.settings.bonusHome);
  const type = captured.length ? 'capture' : res.finished ? 'finish' : 'move';
  setAction(r, { type, color: p.color, token: ti, from: res.from, to: res.to, captured, dice: roll, bonus: extra });
  if (!extra) advance(r);
  sync(r);
}

// Number of opponent tokens that could hit a (non-safe) track cell on their next roll.
function danger(r, color, pos) {
  if (pos < 0 || pos > L.LAST_TRACK) return 0;
  const idx = L.trackIndex(color, pos);
  if (L.SAFE.has(idx)) return 0;
  let n = 0;
  L.COLORS.forEach((c) => {
    const q = r.players[c];
    if (c === color || !q || q.left) return;
    q.tokens.forEach((tp) => {
      if (tp < 0 || tp > L.LAST_TRACK) return;
      const d = (idx - L.trackIndex(c, tp) + L.TRACK_LEN) % L.TRACK_LEN;
      if (d >= 1 && d <= 6) n++;
    });
  });
  return n;
}

// Heuristic used by bots, auto-pilot and timed-out turns.
function bestMove(r, p) {
  let best = r.legal[0], bestScore = -Infinity;
  r.legal.forEach((ti) => {
    const from = p.tokens[ti], to = from === -1 ? 0 : from + r.dice;
    let s = to;
    if (L.captureTargets(r.players, p.color, to).length) s += 100;
    if (to === L.FINISH) s += 90;
    if (from === -1) s += 50;
    if (to <= L.LAST_TRACK && L.SAFE.has(L.trackIndex(p.color, to))) s += 15;
    if (to > L.LAST_TRACK) s += 25;
    s += 6 * (danger(r, p.color, from) - danger(r, p.color, to));
    if (s > bestScore) { bestScore = s; best = ti; }
  });
  return best;
}

function autoStep(r) {
  const q = r.players[r.turn];
  if (r.phase !== 'playing' || !q) return;
  if (r.dice === null) doRoll(r, q);
  else if (r.legal.length) doMove(r, q, bestMove(r, q));
}

// Keeps the game moving: plays for bots / disconnected / idle players and runs the turn timer.
function schedule(r) {
  if (r.phase !== 'playing' || r.timerKind === 'pass') return;
  const p = r.players[r.turn];
  if (!p) return;
  if (!(r.dice === null || r.legal.length > 0)) return;
  const key = r.turn + '|' + r.rollId + '|' + (r.dice === null ? 0 : 1) + '|' + (automated(p) ? 'a' : 'h') + '|' + r.settings.timer;
  if (r.timerKey === key && r.timer) return;
  clearTimer(r);
  r.timerKey = key;
  if (automated(p)) {
    const quick = p.bot || p.auto;
    const delay = r.dice === null ? (quick ? T.botRoll : T.autoRoll) : (quick ? T.botMove : T.autoMove);
    setTimer(r, 'auto', delay, () => {
      const q = r.players[r.turn];
      if (r.phase === 'playing' && q && automated(q)) autoStep(r);
    });
  } else if (r.settings.timer > 0) {
    const ms = r.settings.timer * UNIT;
    setTimer(r, 'turn', ms, () => {
      const q = r.players[r.turn];
      if (r.phase !== 'playing' || !q || automated(q)) return;
      q.strikes++;
      if (q.strikes >= 2) { q.auto = true; notice(r, 'autopilot', q); }
      autoStep(r);
    });
    r.deadline = Date.now() + ms;
  }
}

/* ---------- membership ---------- */
function pickHost(r) {
  const list = humans(r);
  r.host = list.find((c) => r.players[c].connected) || list[0] || null;
}

function removeSeat(r, p, key) {
  clearTimeout(p.dropTimer);
  if (r.phase === 'playing') {
    p.left = true; p.connected = false; p.sid = null;
    p.tokens = [-1, -1, -1, -1];
  } else {
    delete r.players[p.color];
  }
  if (!humans(r).length) { destroyRoom(r); return; }
  if (!r.players[r.host] || r.players[r.host].left || r.host === p.color) pickHost(r);
  notice(r, key || 'left', p);
  if (r.phase === 'playing') {
    const list = active(r);
    if (list.length === 1) {
      clearTimer(r);
      r.phase = 'ended'; r.winner = list[0]; r.dice = null; r.legal = [];
      setAction(r, { type: 'win', color: list[0], forfeit: true });
    } else if (r.turn === p.color) {
      clearTimer(r);
      advance(r);
      setAction(r, { type: 'turn', color: r.turn });
    }
  }
  sync(r);
}

function leaveCurrent(socket) {
  const c = ctxOf(socket);
  socket.data.code = null; socket.data.color = null;
  if (!c) return;
  socket.leave(c.r.code);
  removeSeat(c.r, c.p, 'left');
}

function hostCtx(socket, cb, phase) {
  const c = ctxOf(socket);
  if (!c) { cb({ ok: false, error: 'NOT_IN_ROOM' }); return null; }
  if (phase && c.r.phase !== phase) { cb({ ok: false, error: 'BAD_STATE' }); return null; }
  if (c.r.host !== c.p.color) { cb({ ok: false, error: 'NOT_HOST' }); return null; }
  return c;
}

// Messages a given player may see: public ones, plus private ones they sent or received.
function chatHistoryFor(r, p) {
  return r.chatLog.filter((e) => !e.toPid || e.fromPid === p.pid || e.toPid === p.pid).map((e) => e.m);
}

/* ---------- sockets ---------- */
io.on('connection', (socket) => {
  socket.data = { code: null, color: null };

  socket.on('room:create', (d, cb) => {
    cb = ack(cb);
    const prof = readProfile(d);
    if (!prof) return cb({ ok: false, error: 'BAD_INPUT' });
    leaveCurrent(socket);
    const r = newRoom();
    rooms.set(r.code, r);
    const p = addPlayer(r, socket, prof, prof.color || 'red');
    r.host = p.color;
    cb({ ok: true, code: r.code, pid: p.pid, color: p.color });
    broadcast(r);
  });

  socket.on('room:peek', (d, cb) => {
    cb = ack(cb);
    const r = rooms.get(normCode(d && d.code));
    if (!r) return cb({ ok: false, error: 'ROOM_NOT_FOUND' });
    cb({ ok: true, taken: seated(r), phase: r.phase, count: seated(r).length });
  });

  socket.on('room:join', (d, cb) => {
    cb = ack(cb);
    const r = rooms.get(normCode(d && d.code));
    if (!r) return cb({ ok: false, error: 'ROOM_NOT_FOUND' });
    const prof = readProfile(d);
    if (!prof) return cb({ ok: false, error: 'BAD_INPUT' });
    if (r.phase !== 'lobby') return cb({ ok: false, error: 'GAME_STARTED' });
    if (socket.data.code === r.code) leaveCurrent(socket);
    if (!rooms.has(r.code)) return cb({ ok: false, error: 'ROOM_NOT_FOUND' });
    if (seated(r).length >= 4) return cb({ ok: false, error: 'ROOM_FULL' });
    let color = prof.color;
    if (color && r.players[color]) return cb({ ok: false, error: 'COLOR_TAKEN' });
    if (!color) color = L.COLORS.find((c) => !r.players[c]);
    leaveCurrent(socket);
    const p = addPlayer(r, socket, prof, color);
    cb({ ok: true, code: r.code, pid: p.pid, color });
    socket.emit('chat:history', chatHistoryFor(r, p));
    notice(r, 'joined', p);
    broadcast(r);
  });

  socket.on('room:rejoin', (d, cb) => {
    cb = ack(cb);
    const r = rooms.get(normCode(d && d.code));
    if (!r) return cb({ ok: false, error: 'ROOM_NOT_FOUND' });
    const p = L.COLORS.map((c) => r.players[c]).find((x) => x && !x.bot && typeof d.pid === 'string' && x.pid === d.pid);
    if (!p || p.left) return cb({ ok: false, error: 'NO_SESSION' });
    if (socket.data.code && socket.data.code !== r.code) leaveCurrent(socket);
    clearTimeout(p.dropTimer);
    p.sid = socket.id; p.connected = true; p.auto = false; p.strikes = 0;
    socket.data.code = r.code; socket.data.color = p.color;
    socket.join(r.code);
    cb({ ok: true, code: r.code, pid: p.pid, color: p.color });
    socket.emit('chat:history', chatHistoryFor(r, p));
    notice(r, 'back', p);
    sync(r);
  });

  socket.on('room:color', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    const { r, p } = c;
    if (r.phase !== 'lobby') return cb({ ok: false, error: 'BAD_STATE' });
    const nc = d && d.color;
    if (!L.COLORS.includes(nc)) return cb({ ok: false, error: 'BAD_INPUT' });
    if (nc === p.color) return cb({ ok: true, color: nc });
    if (r.players[nc]) return cb({ ok: false, error: 'COLOR_TAKEN' });
    delete r.players[p.color];
    if (r.host === p.color) r.host = nc;
    p.color = nc; p.ready = false;
    r.players[nc] = p;
    socket.data.color = nc;
    cb({ ok: true, color: nc });
    broadcast(r);
  });

  socket.on('room:ready', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    if (c.r.phase !== 'lobby') return cb({ ok: false, error: 'BAD_STATE' });
    c.p.ready = !!(d && d.ready);
    cb({ ok: true });
    broadcast(c.r);
  });

  socket.on('room:settings', (d, cb) => {
    cb = ack(cb);
    const c = hostCtx(socket, cb, 'lobby');
    if (!c) return;
    d = d || {};
    const s = c.r.settings;
    if (d.timer !== undefined) {
      if (!TIMERS.includes(d.timer)) return cb({ ok: false, error: 'BAD_INPUT' });
      s.timer = d.timer;
    }
    if (d.bonusCapture !== undefined) s.bonusCapture = !!d.bonusCapture;
    if (d.bonusHome !== undefined) s.bonusHome = !!d.bonusHome;
    if (d.chat !== undefined) s.chat = !!d.chat;
    cb({ ok: true });
    broadcast(c.r);
  });

  socket.on('room:addBot', (d, cb) => {
    cb = ack(cb);
    const c = hostCtx(socket, cb, 'lobby');
    if (!c) return;
    const r = c.r;
    const color = L.COLORS.find((k) => !r.players[k]);
    if (!color) return cb({ ok: false, error: 'ROOM_FULL' });
    r.players[color] = mkPlayer(color, 'Bot', AVATARS - 1, null, true);
    cb({ ok: true });
    broadcast(r);
  });

  socket.on('room:removeBot', (d, cb) => {
    cb = ack(cb);
    const c = hostCtx(socket, cb, 'lobby');
    if (!c) return;
    const k = d && d.color, b = L.COLORS.includes(k) && c.r.players[k];
    if (!b || !b.bot) return cb({ ok: false, error: 'BAD_INPUT' });
    delete c.r.players[k];
    cb({ ok: true });
    broadcast(c.r);
  });

  socket.on('room:leave', (d, cb) => {
    cb = ack(cb);
    leaveCurrent(socket);
    cb({ ok: true });
  });

  socket.on('game:start', (d, cb) => {
    cb = ack(cb);
    const c = hostCtx(socket, cb, 'lobby');
    if (!c) return;
    const r = c.r, list = seated(r);
    if (list.length < 2) return cb({ ok: false, error: 'NEED_PLAYERS' });
    if (list.some((k) => k !== r.host && (!r.players[k].ready || !r.players[k].connected))) {
      return cb({ ok: false, error: 'NOT_READY' });
    }
    cb({ ok: true });
    startGame(r);
  });

  socket.on('game:roll', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    const { r, p } = c;
    if (r.phase !== 'playing') return cb({ ok: false, error: 'BAD_STATE' });
    if (r.turn !== p.color) return cb({ ok: false, error: 'NOT_YOUR_TURN' });
    if (r.dice !== null) return cb({ ok: false, error: 'BAD_STATE' });
    p.auto = false; p.strikes = 0;
    cb({ ok: true });
    doRoll(r, p);
  });

  socket.on('game:move', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    const { r, p } = c;
    if (r.phase !== 'playing') return cb({ ok: false, error: 'BAD_STATE' });
    if (r.turn !== p.color) return cb({ ok: false, error: 'NOT_YOUR_TURN' });
    const ti = d && d.token;
    if (r.dice === null || !Number.isInteger(ti) || !r.legal.includes(ti)) {
      return cb({ ok: false, error: 'ILLEGAL_MOVE' });
    }
    p.auto = false; p.strikes = 0;
    cb({ ok: true });
    doMove(r, p, ti);
  });

  socket.on('game:again', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    const { r } = c;
    if (r.phase === 'ended') {
      clearTimer(r);
      seated(r).forEach((k) => {
        const q = r.players[k];
        if (q.left) { delete r.players[k]; return; }
        q.tokens = [-1, -1, -1, -1]; q.ready = q.bot; q.auto = false; q.strikes = 0;
      });
      r.phase = 'lobby'; r.turn = null; r.dice = null; r.legal = []; r.winner = null; r.action = null; r.timerKey = null;
      if (!r.players[r.host]) pickHost(r);
      broadcast(r);
    }
    cb({ ok: true });
  });

  function throttled(c) {
    const now = Date.now();
    if (now - c.p.lastEmoji < 700) return true;
    c.p.lastEmoji = now;
    return false;
  }

  socket.on('game:emoji', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    const e = d && d.emoji;
    if (!EMOJIS.includes(e)) return cb({ ok: false, error: 'BAD_INPUT' });
    if (throttled(c)) return cb({ ok: false, error: 'RATE' });
    io.to(c.r.code).emit('game:emoji', { color: c.p.color, emoji: e, id: Date.now() + ':' + c.p.color });
    cb({ ok: true });
  });

  socket.on('game:chat', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    const id = d && d.id;
    if (!Number.isInteger(id) || id < 0 || id >= QUICK_CHAT) return cb({ ok: false, error: 'BAD_INPUT' });
    if (throttled(c)) return cb({ ok: false, error: 'RATE' });
    io.to(c.r.code).emit('game:chat', { color: c.p.color, id });
    cb({ ok: true });
  });

  socket.on('chat:send', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    const { r, p } = c;
    if (!r.settings.chat) return cb({ ok: false, error: 'CHAT_OFF' });
    d = d || {};
    const text = cleanChat(d.text);
    if (!text) return cb({ ok: false, error: 'BAD_INPUT' });
    let target = null;
    if (d.to != null) {
      target = L.COLORS.includes(d.to) ? r.players[d.to] : null;
      if (!target || target === p || target.bot || target.left) return cb({ ok: false, error: 'BAD_INPUT' });
    }
    const now = Date.now();
    p.chatTimes = (p.chatTimes || []).filter((t) => now - t < 6000);
    if (p.chatTimes.length >= 5) return cb({ ok: false, error: 'RATE' }); // max 5 messages per 6 seconds
    p.chatTimes.push(now);
    const m = { id: ++r.chatSeq, from: p.color, name: p.name, text, to: target ? target.color : null, toName: target ? target.name : null, t: now };
    r.chatLog.push({ m, fromPid: p.pid, toPid: target ? target.pid : null });
    if (r.chatLog.length > CHAT_KEEP) r.chatLog.shift();
    r.last = now;
    if (!target) io.to(r.code).emit('chat:msg', m);          // everyone in the room
    else {                                                     // private: only the two people involved
      if (p.sid) io.to(p.sid).emit('chat:msg', m);
      if (target.sid) io.to(target.sid).emit('chat:msg', m);
    }
    cb({ ok: true, id: m.id });
  });

  socket.on('chat:history', (d, cb) => {
    cb = ack(cb);
    const c = ctxOf(socket);
    if (!c) return cb({ ok: false, error: 'NOT_IN_ROOM' });
    cb({ ok: true, list: chatHistoryFor(c.r, c.p) });
  });

  socket.on('disconnect', () => {
    const c = ctxOf(socket);
    if (!c) return;
    const { r, p } = c;
    p.connected = false; p.sid = null;
    notice(r, 'disc', p);
    if (r.phase === 'playing') sync(r);
    else {
      broadcast(r);
      p.dropTimer = setTimeout(() => {
        if (!p.connected && r.players[p.color] === p) removeSeat(r, p, 'left');
      }, T.lobbyDrop);
    }
  });
});

// Remove abandoned rooms.
setInterval(() => {
  const now = Date.now();
  rooms.forEach((r) => {
    const anyone = humans(r).some((c) => r.players[c].connected);
    if (!anyone && now - r.last > (r.phase === 'playing' ? 300000 : 60000)) destroyRoom(r);
  });
}, 30000).unref();

server.listen(PORT, '0.0.0.0', () => console.log('Ludo Party listening on port ' + PORT));
module.exports = { server, io, rooms };
