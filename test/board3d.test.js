'use strict';
// Pure-math tests for the 3D board (no GPU needed): dice orientation and camera rotation.
const assert = require('assert');
global.window = global;
global.THREE = require('../public/vendor/three.min.js');
global.Ludo = require('../shared/ludo');
require('../public/js/board3d.js');
const B = global.Board3D, THREE = global.THREE, L = global.Ludo, P = B.prototype;
assert(B, 'Board3D loaded');

// --- dice: opposite faces sum to 7 and every value can be brought face-up, for any extra spin
const BOX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
BOX.forEach((n, i) => assert.deepStrictEqual(B.FACE_NORMAL[B.FACE_VAL[i]], n, 'face table matches box face order ' + i));
[[0, 1], [2, 3], [4, 5]].forEach(([a, b]) => assert.strictEqual(B.FACE_VAL[a] + B.FACE_VAL[b], 7, 'opposite faces sum to 7'));
for (let v = 1; v <= 6; v++) {
  for (let k = 0; k < 40; k++) {
    const q = P.quatForValue.call({}, v, Math.random() * Math.PI * 2);
    const n = B.FACE_NORMAL[v], up = new THREE.Vector3(n[0], n[1], n[2]).applyQuaternion(q);
    assert(up.y > 0.9999, 'value ' + v + ' ends face-up');
  }
}
console.log('ok  dice orientation: every value lands face-up (240 random spins)');

// --- camera: fits every key point and puts the local colour's base at the bottom-left for every colour
const fake = { camera: new THREE.PerspectiveCamera(30, 1, 0.5, 200), keyPoints: P.keyPoints, poseAt: P.poseAt };
P.fitCamera.call(fake);
assert(fake.fit && isFinite(fake.fit.dist) && fake.fit.dist > 12 && fake.fit.dist < 120, 'camera fit found');
const pts = P.keyPoints.call(fake, 0), v = new THREE.Vector3();
P.poseAt.call(fake, fake.camera, 0, B.ELEV, fake.fit.dist, fake.fit.tz);
pts.forEach((p) => { v.copy(p).project(fake.camera); assert(Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.97, 'key point inside the frame'); });
const proj = (yaw) => {
  P.poseAt.call(fake, fake.camera, yaw, B.ELEV, fake.fit.dist, fake.fit.tz);
  const out = {};
  L.COLORS.forEach((c) => { const o = L.BASE_ORIGIN[c]; const p = new THREE.Vector3(o[0] + 3 - 7.5, 0.2, o[1] + 3 - 7.5).project(fake.camera); out[c] = p; });
  return out;
};
L.COLORS.forEach((c, i) => {
  const k = (3 - i + 4) % 4, s = proj(k * Math.PI / 2), me = s[c];
  const others = L.COLORS.filter((x) => x !== c).map((x) => s[x]);
  assert(me.x < -0.3, c + ' base is on the left');
  assert(others.filter((o) => o.y > me.y + 0.4).length === 2, c + ' base is in the bottom row');
  const sameRow = others.filter((o) => Math.abs(o.y - me.y) < 0.2);
  assert(sameRow.length === 1 && sameRow[0].x > me.x + 0.5, c + ' bottom-left (the other bottom base is to its right)');
});
console.log('ok  camera rotation: each colour\'s base sits bottom-left (4/4) and the frame fits all key points');
console.log('board3d.test.js: all assertions passed');
