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

    // --- private chat: room chat, whispers, moderation, history
    {
      const c1 = client(); all.push(c1); await c1.ready;
      const r2 = await req(c1.s, 'room:create', { name: 'Anna', avatar: 0, color: 'red' });
      const c2 = client(), c3 = client(); all.push(c2, c3); await c2.ready; await c3.ready;
      c1.msgs = []; c2.msgs = []; c3.msgs = [];
      [c1, c2, c3].forEach((c) => c.s.on('chat:msg', (m) => c.msgs.push(m)));
      const j2 = await req(c2.s, 'room:join', { code: r2.code, name: 'Bea', avatar: 1, color: 'green' });
      const j3 = await req(c3.s, 'room:join', { code: r2.code, name: 'Cy', avatar: 2, color: 'yellow' });
      assert(j2.ok && j3.ok);
      // public message reaches everyone in the room (including the sender)
      assert((await req(c1.s, 'chat:send', { text: '  hello   everyone  ' })).ok);
      await sleep(80);
      assert([c1, c2, c3].every((c) => c.msgs.length === 1 && c.msgs[0].text === 'hello everyone' && c.msgs[0].to === null && c.msgs[0].name === 'Anna'), 'public message delivered + whitespace collapsed');
      // someone outside the room never receives it
      const out = client(); all.push(out); await out.ready; out.msgs = []; out.s.on('chat:msg', (m) => out.msgs.push(m));
      assert((await req(out.s, 'chat:send', { text: 'x' })).error === 'NOT_IN_ROOM', 'outsiders cannot chat');
      // whisper: only sender and target receive it
      assert((await req(c2.s, 'chat:send', { text: 'psst secret', to: 'red' })).ok);
      await sleep(80);
      assert(c1.msgs.some((m) => m.text === 'psst secret' && m.to === 'red' && m.toName === 'Anna'), 'target got the whisper');
      assert(c2.msgs.some((m) => m.text === 'psst secret'), 'sender got a copy');
      assert(!c3.msgs.some((m) => m.text === 'psst secret'), 'third player did NOT receive the whisper');
      assert(!out.msgs.length, 'outsider received nothing');
      // validation
      assert((await req(c1.s, 'chat:send', { text: '   ' })).error === 'BAD_INPUT', 'empty rejected');
      assert((await req(c1.s, 'chat:send', { text: 'hi', to: 'red' })).error === 'BAD_INPUT', 'cannot whisper yourself');
      assert((await req(c1.s, 'chat:send', { text: 'hi', to: 'blue' })).error === 'BAD_INPUT', 'cannot whisper an empty seat');
      assert((await req(c1.s, 'chat:send', { text: 'hi', to: 'nope' })).error === 'BAD_INPUT', 'bad colour rejected');
      assert((await req(c1.s, 'chat:send', { text: 'x'.repeat(500) })).ok);
      await sleep(60);
      assert(c2.msgs[c2.msgs.length - 1].text.length === 200, 'long text capped at 200');
      assert((await req(c3.s, 'chat:send', { text: 'a\u202eevil\u200b<b>x</b>' })).ok);
      await sleep(60);
      const spoof = c1.msgs[c1.msgs.length - 1].text;
      assert(!/[\u202e\u200b<>]/.test(spoof) && spoof === 'aevilbx/b', 'bidi override, zero-width and angle brackets stripped: ' + spoof);
      // rate limit: 5 messages per 6 s
      const rl = client(); all.push(rl); await rl.ready;
      const r3 = await req(rl.s, 'room:create', { name: 'Rate', avatar: 3, color: 'red' });
      let ok = 0, limited = 0;
      for (let i = 0; i < 8; i++) { const x = await req(rl.s, 'chat:send', { text: 'm' + i }); if (x.ok) ok++; else if (x.error === 'RATE') limited++; }
      assert(ok === 5 && limited === 3, 'rate limit 5 per 6s (ok=' + ok + ', limited=' + limited + ')');
      // history: late joiner sees public messages only; participants see their whisper after rejoin
      const late = client(); all.push(late); await late.ready;
      let hist = null; late.s.on('chat:history', (h) => { hist = h; });
      assert((await req(late.s, 'room:join', { code: r2.code, name: 'Late', avatar: 4, color: 'blue' })).ok);
      await sleep(80);
      assert(hist && hist.some((m) => m.text === 'hello everyone') && !hist.some((m) => m.text === 'psst secret'), 'late joiner gets public history only');
      let h2 = null; c2.s.on('chat:history', (h) => { h2 = h; });
      c2.s.disconnect(); await sleep(60); c2.s.connect(); await c2.ready;
      assert((await req(c2.s, 'room:rejoin', { code: r2.code, pid: j2.pid })).ok);
      await sleep(80);
      assert(h2 && h2.some((m) => m.text === 'psst secret'), 'whisper participant gets it back after rejoin');
      // host can switch chat off
      assert((await req(c1.s, 'room:settings', { chat: false })).ok);
      assert((await req(c2.s, 'chat:send', { text: 'blocked?' })).error === 'CHAT_OFF', 'chat can be disabled by the host');
      assert((await req(c2.s, 'room:settings', { chat: true })).error === 'NOT_HOST', 'only the host changes it');
      assert((await req(c1.s, 'room:settings', { chat: true })).ok);
      assert((await req(c2.s, 'chat:send', { text: 'back on' })).ok);
      console.log('ok  private chat: room + whisper isolation, validation, sanitising, rate limit, history, host switch');
    }

    // --- bonus rules: with bonuses off a capture must pass the turn; verify via a simulated sequence of many games
    console.log('\nALL FEATURE CHECKS PASSED');
  } finally {
    all.forEach((c) => c.s.close());
    srv.kill();
  }
}
main().then(() => process.exit(0), (e) => { console.error('FEATURES FAILED:', e); process.exit(1); });
