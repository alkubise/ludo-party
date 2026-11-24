/*
 * Ludo Party – shared catalog: skins, themes, emoji categories and effects.
 * Loaded by the Node server (to validate input) and by the browser (to build the UI),
 * so both sides always agree on what is allowed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Catalog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var THEMES = ['classic', 'wood', 'neon', 'royal', 'ocean', 'desert'];   // board themes (local to each player)
  var PAWNS = ['classic', 'crown', 'gem', 'orb', 'rook'];                  // pawn shapes (seen by everyone)
  var FINISHES = ['glossy', 'matte', 'gold', 'chrome', 'glass', 'neon'];   // pawn materials (seen by everyone)
  var DICES = ['ivory', 'ruby', 'onyx', 'ice', 'neon', 'wood'];            // dice skins (seen by everyone)
  var DEFAULT_SKIN = { pawn: 'classic', finish: 'glossy', dice: 'ivory' };
  var DEFAULT_STYLE = { theme: 'classic', pawn: 'classic', finish: 'glossy', dice: 'ivory' };

  var EMOJI_CATS = [
    { id: 'faces', icon: '😀', list: ['😂', '😎', '😡', '😱', '😭', '🤯', '😍', '🥳', '😴', '🤔', '😇', '😈', '🥶', '🤪', '😤', '🙄', '😅', '🤩', '😏', '🥺', '🤡', '💀', '👻', '👽'] },
    { id: 'love', icon: '❤️', list: ['❤️', '💔', '💙', '💚', '💛', '🧡', '💜', '💖', '💯', '😘', '🌹', '💋'] },
    { id: 'hands', icon: '👏', list: ['👏', '👍', '👎', '🙏', '💪', '👋', '🤝', '✌️', '🤞', '👀', '🙌', '🤌'] },
    { id: 'fun', icon: '🎉', list: ['🎉', '🔥', '👑', '🏆', '🎲', '🎯', '💎', '🎁', '⭐', '🌟', '💥', '⚡', '🍀', '🏁', '🚀', '💣', '🎈', '🍿', '💰', '☕'] },
    { id: 'animals', icon: '🦁', list: ['🦁', '🐯', '🐼', '🦊', '🐸', '🐙', '🦄', '🐲', '🦅', '🐬', '🐱', '🐶', '🐒', '🦉', '🐢', '🦈'] }
  ];
  // Animated reaction behaviours; anything not listed floats up like a balloon.
  var EFFECTS = {
    burst: ['🎉', '🥳', '💥', '🔥', '⭐', '🌟', '⚡', '🏆', '👑'],
    rain: ['❤️', '😍', '💎', '🍀', '💖', '💙', '💚', '💛', '🧡', '💜', '🎈', '💰', '🌹', '💋'],
    shake: ['😡', '🤯', '😤', '😱', '💣'],
    spin: ['🎲', '🎯', '🤪', '🌟']
  };
  var EMOJIS = [];
  EMOJI_CATS.forEach(function (c) { c.list.forEach(function (e) { if (EMOJIS.indexOf(e) < 0) EMOJIS.push(e); }); });

  function effectOf(e) {
    var keys = Object.keys(EFFECTS);
    for (var i = 0; i < keys.length; i++) if (EFFECTS[keys[i]].indexOf(e) >= 0) return keys[i];
    return 'float';
  }
  // Returns a clean skin object, or null when something is not in the catalog. Missing fields use the defaults.
  function cleanSkin(s) {
    if (s == null) return { pawn: DEFAULT_SKIN.pawn, finish: DEFAULT_SKIN.finish, dice: DEFAULT_SKIN.dice };
    if (typeof s !== 'object') return null;
    var out = { pawn: s.pawn == null ? DEFAULT_SKIN.pawn : s.pawn, finish: s.finish == null ? DEFAULT_SKIN.finish : s.finish, dice: s.dice == null ? DEFAULT_SKIN.dice : s.dice };
    if (PAWNS.indexOf(out.pawn) < 0 || FINISHES.indexOf(out.finish) < 0 || DICES.indexOf(out.dice) < 0) return null;
    return out;
  }

  return {
    THEMES: THEMES, PAWNS: PAWNS, FINISHES: FINISHES, DICES: DICES,
    DEFAULT_SKIN: DEFAULT_SKIN, DEFAULT_STYLE: DEFAULT_STYLE,
    EMOJI_CATS: EMOJI_CATS, EMOJIS: EMOJIS, EFFECTS: EFFECTS, effectOf: effectOf, cleanSkin: cleanSkin,
    QUICK_CHAT: 12, AVATAR_COUNT: 40, BOT_AVATAR: 11
  };
});
