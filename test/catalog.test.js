'use strict';
// Catalog consistency: skins, emoji, avatars and that every label exists in both languages.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../shared/catalog');

const uniq = (a) => new Set(a).size === a.length;
['THEMES', 'PAWNS', 'FINISHES', 'DICES', 'EMOJIS'].forEach((k) => { assert(C[k].length > 0 && uniq(C[k]), k + ' non-empty and unique'); });
assert(C.EMOJI_CATS.length >= 5, 'emoji categories');
Object.keys(C.EFFECTS).forEach((k) => C.EFFECTS[k].forEach((e) => assert(C.EMOJIS.includes(e), 'effect emoji ' + e + ' is in the catalog')));
assert.strictEqual(C.effectOf('🎉'), 'burst'); assert.strictEqual(C.effectOf('❤️'), 'rain'); assert.strictEqual(C.effectOf('🙏'), 'float');
assert.deepStrictEqual(C.cleanSkin(undefined), C.DEFAULT_SKIN);
assert.deepStrictEqual(C.cleanSkin({ pawn: 'gem' }), { pawn: 'gem', finish: 'glossy', dice: 'ivory' });
assert.strictEqual(C.cleanSkin({ pawn: 'dragon' }), null); assert.strictEqual(C.cleanSkin('x'), null); assert.strictEqual(C.cleanSkin({ dice: 5 }), null);
assert(C.THEMES.includes(C.DEFAULT_STYLE.theme) && C.PAWNS.includes(C.DEFAULT_STYLE.pawn));
console.log('ok  catalog lists, effects and skin validation');

// the client avatar table must match what the server accepts
const src = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
const avatars = eval(src.match(/var AVATARS = (\[[\s\S]*?\]);/)[1]); // eslint-disable-line no-eval
assert.strictEqual(avatars.length, C.AVATAR_COUNT, 'client has ' + C.AVATAR_COUNT + ' avatars');
assert.strictEqual(avatars[C.BOT_AVATAR], '🤖', 'robot avatar reserved for bots');
assert(uniq(avatars), 'avatars are unique');
console.log('ok  40 unique avatars, robot reserved for bots');

// every label used by the customize screen and phrases exists in Arabic and English
global.window = global;
global.document = { documentElement: {}, querySelectorAll: () => [] };
require('../public/js/i18n.js');
const I = global.I18N, keys = [];
C.THEMES.forEach((x) => keys.push('t.' + x)); C.PAWNS.forEach((x) => keys.push('p.' + x));
C.FINISHES.forEach((x) => keys.push('f.' + x)); C.DICES.forEach((x) => keys.push('d.' + x));
for (let i = 0; i < C.QUICK_CHAT; i++) keys.push('chat' + i);
['styleTitle', 'tabBoard', 'tabPawn', 'tabDice', 'btnStyle', 'lobbyStyle', 'groupShape', 'groupFinish', 'chatFeedToggle', 'phrasesTab'].forEach((x) => keys.push(x));
['ar', 'en'].forEach((lang) => {
  I.setLang(lang);
  keys.forEach((k) => assert(I.t(k) !== k, 'missing ' + lang + ' translation for "' + k + '"'));
});
console.log('ok  ' + keys.length + ' labels translated in Arabic and English');
console.log('catalog.test.js: all assertions passed');
