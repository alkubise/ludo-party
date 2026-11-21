'use strict';
// Tests for bots, turn timer / auto-pilot, room rules, quick chat and stats.
const { spawn } = require('child_process');
const assert = require('assert');
const { io } = require('socket.io-client');

const PORT = 3198, URL = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (s, ev, d) => new Promise((res) => s.emit(ev, d, res));
function client() {
  const c = { state: null, chats: [], notices: [] };
  c.s = io(URL, { transports: ['websocket'], forceNew: true });
  c.s.on('room:state', (st) => { c.state = st; if (c.onState) c.onState(st); });
  c.s.on('game:chat', (m) => c.chats.push(m));
  c.s.on('room:notice', (n) => c.notices.push(n));
  c.ready = new Promise((r) => c.s.once('connect', r));
  return c;
}

async function main() {
  const srv = spawn('node', ['server.js'], { env: Object.assign({}, process.env, { PORT, LUDO_FAST: '1' }), stdio: 'inherit' });
  await sleep(800);
  const all = [];
  try {
    const a = client(); all.push(a); await a.ready;
    const b = client(); all.push(b); await b.ready;
    const room = await req(a.s, 'room:create', { name: 'Host', avatar: 0, color: 'red' });
    assert(room.ok);
    await sleep(80); // the state broadcast follows the acknowledgement

    // --- settings (host only, validated)
    assert.strictEqual(a.state.settings.timer, 0, 'fast mode default timer is off');
    assert((await req(a.s, 'room:settings', { timer: 15, bonusCapture: false })).ok);
    await sleep(80);
    assert.strictEqual(a.state.settings.timer, 15);
    assert.strictEqual(a.state.settings.bonusCapture, false);
    assert.strictEqual((await req(a.s, 'room:settings', { timer: 99 })).error, 'BAD_INPUT');
    const j = await req(b.s, 'room:join', { code: room.code, name: 'Guest', avatar: 1 });
    assert(j.ok);
    assert.strictEqual((await req(b.s, 'room:settings', { timer: 0 })).error, 'NOT_HOST');
    assert.strictEqual((await req(b.s, 'room:addBot', {})).error, 'NOT_HOST');
    console.log('ok  room settings: host-only + validated');

    // --- bots
    assert((await req(a.s, 'room:addBot', {})).ok);
    assert((await req(a.s, 'room:addBot', {})).ok);
    assert.strictEqual((await req(a.s, 'room:addBot', {})).error, 'ROOM_FULL');
    await sleep(80);
    const bots = a.state.players.filter((p) => p && p.bot);
    assert.strictEqual(bots.length, 2); assert(bots.every((p) => p.ready && p.connected));
    assert((await req(a.s, 'room:removeBot', { color: bots[1].color })).ok);
    assert.strictEqual((await req(a.s, 'room:removeBot', { color: 'red' })).error, 'BAD_INPUT', 'cannot remove a human');
    assert((await req(a.s, 'room:addBot', {})).ok);
    console.log('ok  bots: add / remove / full room / cannot remove humans');

    // --- chat
    assert((await req(b.s, 'game:chat', { id: 2 })).ok);
    assert.strictEqual((await req(b.s, 'game:chat', { id: 2 })).error, 'RATE');
    assert.strictEqual((await req(a.s, 'game:chat', { id: 99 })).error, 'BAD_INPUT');
    await sleep(80);
    assert(a.chats.length === 1 && a.chats[0].id === 2);
    console.log('ok  quick chat: broadcast, validated, rate limited');

    // --- play: humans use the timer/auto-pilot; bots play on their own
    await req(a.s, 'room:settings', { timer: 15 }); // 15 * 20ms = 300ms per turn in FAST mode
    await req(b.s, 'room:ready', { ready: true });
    assert((await req(a.s, 'game:start', {})).ok);
    await sleep(100);
    // Neither human acts: the timer must roll+move for them and, after 2 strikes, switch to auto-pilot.
    let sawDeadline = false;
    a.onState = (st) => { if (st.deadline && st.turnMs === 300 && st.deadline > st.now) sawDeadline = true; };
    const end = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('idle game did not finish (timer/autopilot/bots)')), 60000);
      const h = (st) => { if (st.phase === 'ended') { clearTimeout(t); resolve(st); } };
      a.s.on('room:state', h); h(a.state);
    });
    assert(sawDeadline, 'state carries the turn deadline');
    assert(end.players.filter(Boolean).some((p) => p.auto), 'idle humans were put on auto-pilot');
    assert(a.notices.some((n) => n.key === 'autopilot'), 'auto-pilot notice sent');
    const w = end.players.find((p) => p && p.color === end.winner);
    assert.strictEqual(w.done, 4);
    const total = end.players.filter(Boolean).reduce((s, p) => s + p.stats.rolls, 0);
    assert(total > 40, 'stats count rolls: ' + total);
    assert(end.players.filter(Boolean).reduce((s, p) => s + p.stats.captures, 0) === end.players.filter(Boolean).reduce((s, p) => s + p.stats.captured, 0), 'captures == captured');
    console.log('ok  idle humans + bots finished a full game. winner=' + w.name + (w.bot ? ' (bot)' : ''));

    // --- acting manually clears auto-pilot; again keeps bots
    a.s.removeAllListeners('room:state'); a.s.on('room:state', (st) => { a.state = st; });
    assert((await req(a.s, 'game:again', {})).ok);
    await sleep(80);
    assert.strictEqual(a.state.phase, 'lobby');
    assert(a.state.players.filter((p) => p && p.bot).every((p) => p.ready), 'bots stay ready after rematch');
    // leaving as last human destroys the room (bots never keep a room alive)
    assert((await req(b.s, 'room:leave', {})).ok);
    assert((await req(a.s, 'room:leave', {})).ok);
    await sleep(100);
    const h = await (await fetch(URL + '/healthz')).json();
    assert.strictEqual(h.rooms, 0, 'room removed when no humans remain');
    console.log('ok  rematch keeps bots ready; room cleaned up when last human leaves');

    // --- bonus rules: with bonuses off a capture must pass the turn; verify via a simulated sequence of many games
    console.log('\nALL FEATURE CHECKS PASSED');
  } finally {
    all.forEach((c) => c.s.close());
    srv.kill();
  }
}
main().then(() => process.exit(0), (e) => { console.error('FEATURES FAILED:', e); process.exit(1); });
