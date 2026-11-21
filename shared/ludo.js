/*
 * Ludo Party – shared rules & board geometry.
 * Loaded by the Node server (require) and by the browser (<script>), so the
 * server-authoritative rules and the client rendering can never disagree.
 *
 * Token positions (per player):
 *   -1        in the home base
 *   0 .. 50   on the shared 52-cell track (0 = the player's start cell)
 *   51 .. 55  on the player's private home lane
 *   56        finished (centre)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ludo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Clockwise turn order, matching the board corners: TL, TR, BR, BL.
  const COLORS = ['red', 'green', 'yellow', 'blue'];
  const START = { red: 0, green: 13, yellow: 26, blue: 39 };
  const TRACK_LEN = 52;
  const LAST_TRACK = 50;
  const LANE_FIRST = 51;
  const FINISH = 56;

  // The 52 track cells on a 15x15 grid, clockwise from red's start cell.
  // Each segment: [x, y, dx, dy, count]
  const SEGMENTS = [
    [1, 6, 1, 0, 5], [6, 5, 0, -1, 6], [7, 0, 1, 0, 2], [8, 1, 0, 1, 5],
    [9, 6, 1, 0, 6], [14, 7, 0, 1, 2], [13, 8, -1, 0, 5], [8, 9, 0, 1, 6],
    [7, 14, -1, 0, 2], [6, 13, 0, -1, 5], [5, 8, -1, 0, 6], [0, 7, 0, -1, 2]
  ];
  const TRACK = [];
  SEGMENTS.forEach(function (s) {
    for (let i = 0; i < s[4]; i++) TRACK.push([s[0] + s[2] * i, s[1] + s[3] * i]);
  });

  const LANES = { red: [], green: [], yellow: [], blue: [] };
  for (let i = 0; i < 5; i++) {
    LANES.red.push([1 + i, 7]);
    LANES.green.push([7, 1 + i]);
    LANES.yellow.push([13 - i, 7]);
    LANES.blue.push([7, 13 - i]);
  }

  // Safe cells: every start cell plus the star cell 8 steps after it.
  const SAFE = new Set();
  COLORS.forEach(function (c) { SAFE.add(START[c]); SAFE.add((START[c] + 8) % TRACK_LEN); });

  const BASE_ORIGIN = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
  const BASE_SPOTS = [[1.9, 1.9], [4.1, 1.9], [1.9, 4.1], [4.1, 4.1]];
  const FIN_DIR = { red: [-1, 0], green: [0, -1], yellow: [1, 0], blue: [0, 1] };

  function trackIndex(color, pos) { return (START[color] + pos) % TRACK_LEN; }

  // Board coordinates in cell units (0..15) for a token.
  function coord(color, pos, ti) {
    if (pos === -1) {
      const o = BASE_ORIGIN[color], s = BASE_SPOTS[ti];
      return [o[0] + s[0], o[1] + s[1]];
    }
    if (pos <= LAST_TRACK) {
      const c = TRACK[trackIndex(color, pos)];
      return [c[0] + 0.5, c[1] + 0.5];
    }
    if (pos < FINISH) {
      const c = LANES[color][pos - LANE_FIRST];
      return [c[0] + 0.5, c[1] + 0.5];
    }
    const d = FIN_DIR[color], off = (ti - 1.5) * 0.42;
    return [7.5 + d[0] * 1.0 + (-d[1]) * off, 7.5 + d[1] * 1.0 + d[0] * off];
  }

  // Which token indexes may move with this roll.
  function legalMoves(tokens, roll) {
    const out = [];
    tokens.forEach(function (p, i) {
      if (p === -1) { if (roll === 6) out.push(i); }
      else if (p + roll <= FINISH) out.push(i);
    });
    return out;
  }

  // Opponent tokens that a move to `to` would capture.
  function captureTargets(players, color, to) {
    const res = [];
    if (to < 0 || to > LAST_TRACK) return res;
    const idx = trackIndex(color, to);
    if (SAFE.has(idx)) return res;
    COLORS.forEach(function (c) {
      if (c === color || !players[c] || players[c].left) return;
      players[c].tokens.forEach(function (p, i) {
        if (p >= 0 && p <= LAST_TRACK && trackIndex(c, p) === idx) res.push({ color: c, token: i, from: p });
      });
    });
    return res;
  }

  // Apply a (previously validated) move. Mutates players[*].tokens.
  function moveToken(players, color, ti, roll) {
    const tokens = players[color].tokens;
    const from = tokens[ti];
    const to = from === -1 ? 0 : from + roll;
    const captured = captureTargets(players, color, to);
    captured.forEach(function (c) { players[c.color].tokens[c.token] = -1; });
    tokens[ti] = to;
    return { from: from, to: to, captured: captured, finished: to === FINISH };
  }

  return {
    COLORS: COLORS, START: START, TRACK: TRACK, LANES: LANES, SAFE: SAFE,
    TRACK_LEN: TRACK_LEN, LAST_TRACK: LAST_TRACK, LANE_FIRST: LANE_FIRST, FINISH: FINISH,
    BASE_ORIGIN: BASE_ORIGIN, BASE_SPOTS: BASE_SPOTS, FIN_DIR: FIN_DIR,
    trackIndex: trackIndex, coord: coord, legalMoves: legalMoves,
    captureTargets: captureTargets, moveToken: moveToken
  };
});
