'use strict';
const assert = require('assert');
const L = require('../shared/ludo');

// Track geometry
assert.strictEqual(L.TRACK.length, 52, '52 track cells');
const seen = new Set(L.TRACK.map((c) => c.join(',')));
assert.strictEqual(seen.size, 52, 'track cells are unique');
L.TRACK.forEach((c, i) => {
  assert(c[0] >= 0 && c[0] < 15 && c[1] >= 0 && c[1] < 15, 'in grid');
  const n = L.TRACK[(i + 1) % 52];
  const d = Math.abs(c[0] - n[0]) + Math.abs(c[1] - n[1]);
  assert(d === 1 || d === 2, 'consecutive cells adjacent (or corner step) at ' + i);
});
L.COLORS.forEach((c) => L.LANES[c].forEach((cell) => assert(!seen.has(cell.join(',')), 'lane off track')));
// 90-degree rotational symmetry of start cells about the board centre
const rot = (p) => [14 - p[1], p[0]];
L.COLORS.forEach((c, i, a) => {
  assert.deepStrictEqual(rot(L.TRACK[L.START[c]]), L.TRACK[L.START[a[(i + 1) % 4]]], 'start symmetry ' + c);
});
assert.strictEqual(L.SAFE.size, 8, '8 safe cells');

// Legal moves
assert.deepStrictEqual(L.legalMoves([-1, -1, -1, -1], 3), []);
assert.deepStrictEqual(L.legalMoves([-1, -1, -1, -1], 6), [0, 1, 2, 3]);
assert.deepStrictEqual(L.legalMoves([55, 56, -1, 10], 2), [3], 'cannot overshoot home');
assert.deepStrictEqual(L.legalMoves([55, 56, -1, 10], 1), [0, 3]);

const mk = () => ({ red: { tokens: [-1, -1, -1, -1] }, green: { tokens: [-1, -1, -1, -1] } });
let p = mk(), r;
p.red.tokens[0] = 1;
p.green.tokens[0] = 52 - 13 + 2; // green pos mapping to track idx 2
assert.strictEqual(L.trackIndex('green', p.green.tokens[0]), 2);
r = L.moveToken(p, 'red', 0, 1);  // red 1 -> 2 captures green
assert.strictEqual(r.captured.length, 1);
assert.strictEqual(p.green.tokens[0], -1);
// safe star cell (idx 8) protects
p = mk(); p.red.tokens[0] = 5; p.green.tokens[0] = (8 - 13 + 52) % 52;
r = L.moveToken(p, 'red', 0, 3);
assert.strictEqual(r.captured.length, 0, 'safe cell protects');
// leaving base lands on own start
p = mk(); L.moveToken(p, 'red', 0, 6);
assert.strictEqual(p.red.tokens[0], 0);
// lane tokens are never captured
p = mk(); p.red.tokens[0] = 52; p.green.tokens[0] = 5;
assert.strictEqual(L.captureTargets(p, 'green', 5).length, 0);
// finishing
p = mk(); p.red.tokens[0] = 53; r = L.moveToken(p, 'red', 0, 3);
assert(r.finished && p.red.tokens[0] === 56);
// every position has valid coordinates
L.COLORS.forEach((c) => { for (let pos = -1; pos <= 56; pos++) for (let t = 0; t < 4; t++) {
  assert(L.coord(c, pos, t).every((v) => v >= 0 && v <= 15), c + pos);
}});
console.log('rules.test.js: all assertions passed');
