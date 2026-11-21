'use strict';
// End-to-end multiplayer test: spawns the real server and plays real games over Socket.IO.
const { spawn } = require('child_process');
const assert = require('assert');
const { io } = require('socket.io-client');
const L = require('../shared/ludo');

const PORT = 3199;
const URL = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (s, ev, d) => new Promise((res) => s.emit(ev, d, res));

class Client {
  constructor(name) {
    this.name = name; this.state = null; this.emojis = []; this.notices = [];
    this.s = io(URL, { transports: ['websocket'], forceNew: true });
    this.s.on('room:state', (st) => { this.state = st; if (this.onState) this.onState(st); });
    this.s.on('game:emoji', (e) => this.emojis.push(e));
    this.s.on('room:notice', (n) => this.notices.push(n));
  }
  ready() { return new Promise((r) => (this.s.connected ? r() : this.s.once('connect', r))); }
}

async function main() {
  const srv = spawn('node', ['server.js'], { env: Object.assign({}, process.env, { PORT, LUDO_FAST: '1' }), stdio: 'inherit' });
  await sleep(800);
  const clients = [];
  try {
    const mk = async (n) => { const c = new Client(n); await c.ready(); clients.push(c); return c; };
    const [a, b, c, d, e] = [await mk('A'), await mk('B'), await mk('C'), await mk('D'), await mk('E')];

    // --- rooms
    assert.strictEqual((await req(a.s, 'room:create', { name: 'x', avatar: 99 })).error, 'BAD_INPUT');
    const created = await req(a.s, 'room:create', { name: 'Alice', avatar: 1, color: 'red' });
    assert(created.ok && /^[A-Z2-9]{5}$/.test(created.code)); a.me = created;
    assert.strictEqual((await req(b.s, 'room:join', { code: 'ZZZZZ', name: 'B', avatar: 0 })).error, 'ROOM_NOT_FOUND');
    const peek = await req(b.s, 'room:peek', { code: created.code.toLowerCase() });
    assert(peek.ok && peek.taken.join() === 'red');
    assert.strictEqual((await req(b.s, 'room:join', { code: created.code, name: 'B', avatar: 0, color: 'red' })).error, 'COLOR_TAKEN');
    b.me = await req(b.s, 'room:join', { code: created.code, name: 'Bob', avatar: 2, color: 'green' }); assert(b.me.ok);
    c.me = await req(c.s, 'room:join', { code: created.code, name: 'Cara', avatar: 3 }); assert(c.me.ok);
    d.me = await req(d.s, 'room:join', { code: created.code, name: 'Dan', avatar: 4, color: 'blue' }); assert(d.me.ok);
    assert.strictEqual((await req(e.s, 'room:join', { code: created.code, name: 'E', avatar: 0 })).error, 'ROOM_FULL');
    await sleep(100);
    assert.strictEqual(a.state.players.filter(Boolean).length, 4);
    assert.strictEqual(c.me.color, 'yellow', 'auto-assigned free colour');
    console.log('ok  rooms: create / peek / join / invalid code / colour taken / room full');

    // --- lobby rules
    assert.strictEqual((await req(b.s, 'game:start', {})).error, 'NOT_HOST');
    assert.strictEqual((await req(a.s, 'game:start', {})).error, 'NOT_READY');
    assert.strictEqual((await req(e.s, 'game:roll', {})).error, 'NOT_IN_ROOM');
    assert.strictEqual((await req(a.s, 'game:roll', {})).error, 'BAD_STATE');
    for (const x of [b, c, d]) assert((await req(x.s, 'room:ready', { ready: true })).ok);

    // emoji
    assert((await req(a.s, 'game:emoji', { emoji: '🔥' })).ok);
    assert.strictEqual((await req(a.s, 'game:emoji', { emoji: '🔥' })).error, 'RATE');
    assert.strictEqual((await req(b.s, 'game:emoji', { emoji: '<script>' })).error, 'BAD_INPUT');
    await sleep(100);
    assert(clients.slice(0, 4).every((x) => x.emojis.length === 1 && x.emojis[0].color === 'red'));
    console.log('ok  emoji broadcast + validation + rate limit');

    // --- play a full game with 4 bots
    const players = [a, b, c, d];
    const stats = { rolls: 0, moves: 0, captures: 0, sixes: 0, rejected: 0 };
    let lastRollId = -1;
    const finished = new Promise((resolve) => {
      players.forEach((p) => {
        p.onState = async (st) => {
          if (st.action && st.action.type === 'capture' && p === a && st.action.id !== p.lastAct) stats.captures++;
          if (st.action) p.lastAct = st.action.id;
          if (st.phase === 'ended') return resolve(st);
          if (st.phase !== 'playing' || st.turn !== p.me.color) return;
          if (st.dice === null) {
            if (p.busy) return; p.busy = true;
            // an out-of-turn roll must be rejected
            const other = players.find((x) => x.me.color !== st.turn);
            if (Math.random() < 0.05) { assert.strictEqual((await req(other.s, 'game:roll', {})).error, 'NOT_YOUR_TURN'); stats.rejected++; }
            const r = await req(p.s, 'game:roll', {}); p.busy = false;
            if (r.ok) stats.rolls++;
          } else if (st.legal.length && st.rollId !== p.movedRoll) {
            p.movedRoll = st.rollId;
            if (st.dice === 6) stats.sixes++;
            // an illegal token must be rejected
            const bad = [0, 1, 2, 3].find((i) => !st.legal.includes(i));
            if (bad !== undefined) { assert.strictEqual((await req(p.s, 'game:move', { token: bad })).error, 'ILLEGAL_MOVE'); stats.rejected++; }
            assert.strictEqual((await req(p.s, 'game:move', { token: 'x' })).error, 'ILLEGAL_MOVE');
            // prefer captures, then random
            const t = st.legal[Math.floor(Math.random() * st.legal.length)];
            const r = await req(p.s, 'game:move', { token: t });
            if (r.ok) stats.moves++;
          }
        };
      });
    });
    assert((await req(a.s, 'game:start', {})).ok);
    const end = await Promise.race([finished, sleep(90000).then(() => { throw new Error('game did not finish in time'); })]);
    const winner = end.players.find((p) => p && p.color === end.winner);
    assert.strictEqual(winner.done, 4, 'winner has 4 finished tokens');
    assert(end.players.filter(Boolean).every((p) => p.tokens.every((t) => t >= -1 && t <= 56)));
    console.log('ok  full game finished. winner=' + winner.name + ' ' + JSON.stringify(stats));
    assert(stats.rolls > 50 && stats.moves > 50);

    // --- play again returns to the lobby
    players.forEach((p) => (p.onState = null));
    assert((await req(b.s, 'game:again', {})).ok);
    await sleep(100);
    assert.strictEqual(a.state.phase, 'lobby');
    assert(a.state.players.filter(Boolean).every((p) => p.tokens.every((t) => t === -1)));
    console.log('ok  play again -> lobby');

    // --- reconnection + autoplay for a disconnected player
    for (const x of [b, c, d]) await req(x.s, 'room:ready', { ready: true });
    assert((await req(a.s, 'game:start', {})).ok);
    await sleep(100);
    const turnColor = a.state.turn;
    const victim = players.find((p) => p.me.color === turnColor);
    const watcher = players.find((p) => p !== victim); // read state from a client that stays connected
    victim.s.disconnect();
    await sleep(100);
    assert.strictEqual(watcher.state.players.find((p) => p && p.color === turnColor).connected, false);
    await sleep(600); // autoplay should have rolled for the absent player
    assert(watcher.state.rollId > 0 || watcher.state.turn !== turnColor, 'autoplay moved the game on');
    victim.s.connect(); await victim.ready();
    const rj = await req(victim.s, 'room:rejoin', { code: created.code, pid: victim.me.pid });
    assert(rj.ok && rj.color === victim.me.color, 'rejoin restores seat');
    assert.strictEqual((await req(e.s, 'room:rejoin', { code: created.code, pid: 'wrong' })).error, 'NO_SESSION');
    await sleep(100);
    assert.strictEqual(watcher.state.players.find((p) => p && p.color === victim.me.color).connected, true);
    console.log('ok  disconnect -> autoplay -> rejoin with secret pid; wrong pid rejected');

    // --- leaving mid game: others continue; last one standing wins
    assert((await req(b.s, 'room:leave', {})).ok);
    assert((await req(c.s, 'room:leave', {})).ok);
    assert((await req(d.s, 'room:leave', {})).ok);
    await sleep(150);
    assert.strictEqual(a.state.phase, 'ended');
    assert.strictEqual(a.state.winner, 'red');
    console.log('ok  forfeit: last remaining player wins');

    const h = await (await fetch(URL + '/healthz')).json(); assert(h.ok);
    console.log('\nALL E2E CHECKS PASSED');
  } finally {
    clients.forEach((c) => c.s.close());
    srv.kill();
  }
}
main().then(() => process.exit(0), (err) => { console.error('E2E FAILED:', err); process.exit(1); });
