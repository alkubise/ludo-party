/* Ludo Party – procedural sound effects & music (WebAudio, no external assets) */
(function () {
  'use strict';
  var ctx = null, master = null, musicGain = null, musicTimer = null, step = 0;
  var sfxOn = true, musicOn = false;

  function ensure() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function tone(f, dur, o) {
    o = o || {};
    var t0 = ctx.currentTime + (o.when || 0);
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    var v = o.gain == null ? 0.2 : o.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(o.dest || master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function noise(dur, v, freq, when) {
    var t0 = ctx.currentTime + (when || 0);
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1800;
    var g = ctx.createGain(); g.gain.value = v;
    src.connect(f); f.connect(g); g.connect(master); src.start(t0);
  }
  function play(fn) { if (!sfxOn) return; try { if (ensure()) fn(); } catch (e) { /* audio is optional */ } }

  var S = {
    click: function () { play(function () { tone(660, 0.06, { type: 'triangle', gain: 0.12 }); }); },
    dice: function () { play(function () { for (var i = 0; i < 7; i++) noise(0.05, 0.5, 1400 + Math.random() * 1600, i * 0.075 + i * i * 0.004); tone(220, 0.1, { when: 0.55, type: 'triangle', gain: 0.1 }); }); },
    step: function () { play(function () { tone(520 + Math.random() * 60, 0.07, { type: 'triangle', gain: 0.12 }); }); },
    capture: function () { play(function () { tone(420, 0.35, { type: 'sawtooth', to: 80, gain: 0.16 }); noise(0.25, 0.5, 700); }); },
    home: function () { play(function () { [659, 784, 988].forEach(function (f, i) { tone(f, 0.18, { when: i * 0.09, type: 'triangle', gain: 0.16 }); }); }); },
    turn: function () { play(function () { tone(784, 0.12, { type: 'sine', gain: 0.14 }); tone(1047, 0.18, { when: 0.1, type: 'sine', gain: 0.14 }); }); },
    pop: function () { play(function () { tone(500, 0.12, { type: 'sine', to: 900, gain: 0.14 }); }); },
    win: function () { play(function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.28, { when: i * 0.13, type: 'triangle', gain: 0.18 }); }); }); },
    tick: function () { play(function () { tone(1200, 0.04, { type: 'square', gain: 0.06 }); }); },
    error: function () { play(function () { tone(200, 0.15, { type: 'square', gain: 0.07 }); }); }
  };

  var NOTES = [262, 294, 330, 392, 440, 523, 440, 392]; // gentle C-major pentatonic loop
  function musicTick() {
    if (!ctx || !musicOn || ctx.state !== 'running') return;
    var n = NOTES[step % NOTES.length];
    tone(n / 2, 0.5, { type: 'triangle', gain: 0.05, dest: musicGain });
    if (step % 4 === 0) tone(n / 4, 0.9, { type: 'sine', gain: 0.06, dest: musicGain });
    step++;
  }
  function applyMusic() {
    clearInterval(musicTimer); musicTimer = null;
    if (musicOn) { try { if (ensure()) musicTimer = setInterval(musicTick, 420); } catch (e) { /* optional */ } }
  }

  window.Sound = Object.assign(S, {
    setSfx: function (v) { sfxOn = !!v; },
    setMusic: function (v) { musicOn = !!v; applyMusic(); },
    unlock: function () { try { ensure(); if (musicOn && !musicTimer) applyMusic(); } catch (e) { /* optional */ } }
  });
})();
