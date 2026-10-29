// Meter the mix without ears: renders every sound effect (and a few bars of each music
// mood) through the real Sfx graph in an OfflineAudioContext, in headless Chromium, and
// prints peak, short-term loudness and a phone-speaker estimate in dBFS.
//
//   node tools/mix.mjs                        # the working tree
//   node tools/mix.mjs --base tools/out/old   # a copy of older engine/ + game/ audio files
//   node tools/mix.mjs --json tools/out/mix.json
//
// peak   sample peak after the master chain (0 dBFS = clipping)
// st     loudest 50 ms window, RMS (what the ear calls "how loud was that hit")
// phone  the same through a 4th-order 300 Hz high-pass, roughly a phone speaker's floor
// low    loudest 50 ms window below 150 Hz (headphone thump; too much of it is mud)
import { launch } from './browser.mjs';
import { startServer } from './serve.mjs';
import fs from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', '').replace(/\/$/, '').replace(/^(?=[^/])/, '/');
const jsonOut = arg('json', null);

const { url, close } = await startServer();
const browser = await launch();
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(e.message));
tab.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await tab.goto(url + '/tools/serve.mjs'); // any same-origin page will do; we only need the origin
const result = await tab.evaluate(async base => {
  // Same noise every run, so before/after numbers compare sounds and not dice.
  let seed = 12345;
  Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const { Sfx } = await import(`${base}/engine/audio/sfx.js`);
  const { defineSounds } = await import(`${base}/game/sounds.js`);
  const { Music } = await import(`${base}/engine/audio/music.js`);
  const { defineMusic } = await import(`${base}/game/music.js`);
  const SR = 48000;
  const db = x => x > 0 ? 20 * Math.log10(x) : -Infinity;

  // Build an Sfx on an offline context. The new engine has attach(); the old one only
  // knew how to make a live AudioContext, so its graph is rebuilt here exactly as unlock() did.
  function rig(ctx) {
    const s = new Sfx();
    defineSounds(s);
    if (s.attach) s.attach(ctx);
    else {
      s.ctx = ctx;
      s.master = ctx.createGain(); s.master.gain.value = s.volume;
      const comp = ctx.createDynamicsCompressor();
      s.master.connect(comp).connect(ctx.destination);
      s.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = s.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return s;
  }
  // The old play() refuses a context that is not 'running'; an offline one never is
  // before rendering. Call through play() when the engine supports offline use.
  // The old engine's only pile-up guard was a 30 ms gap per sound name; keep it, to be fair.
  const fire = (s, name, t, o = {}) => {
    if (s.offline) return s.play(name, o, t);
    if (s.last[name] != null && t - s.last[name] < (o.gap ?? 0.03)) return;
    s.last[name] = t; s.recipes[name](s, t, o);
  };

  async function filtered(buf, kind, hz, order) {
    const ctx = new OfflineAudioContext(1, buf.length, SR);
    const src = ctx.createBufferSource(); src.buffer = buf;
    let node = src;
    for (let i = 0; i < order / 2; i++) { const f = ctx.createBiquadFilter(); f.type = kind; f.frequency.value = hz; f.Q.value = 0.7071; node = node.connect(f); }
    node.connect(ctx.destination); src.start();
    return (await ctx.startRendering()).getChannelData(0);
  }
  const stRms = d => {
    const w = SR * 0.05 | 0, hop = SR * 0.01 | 0;
    let best = 0;
    for (let i = 0; i + w <= d.length; i += hop) {
      let s = 0;
      for (let j = i; j < i + w; j++) s += d[j] * d[j];
      best = Math.max(best, s / w);
    }
    return Math.sqrt(best);
  };
  async function meter(buf) {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), mono = new Float32Array(L.length);
    let peak = 0;
    for (let i = 0; i < L.length; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); mono[i] = (L[i] + R[i]) / 2; }
    const mb = new AudioBuffer({ length: mono.length, sampleRate: SR, numberOfChannels: 1 });
    mb.copyToChannel(mono, 0);
    return {
      peak: db(peak), st: db(stRms(mono)),
      phone: db(stRms(await filtered(mb, 'highpass', 300, 4))),
      low: db(stRms(await filtered(mb, 'lowpass', 150, 4))),
    };
  }
  async function render(seconds, fn, windows) {
    const ctx = new OfflineAudioContext(2, SR * seconds, SR);
    const s = rig(ctx);
    fn(s, ctx);
    const buf = await ctx.startRendering();
    const m = await meter(buf);
    // RMS over given [from, to] second spans, for the ducking check.
    if (windows) m.windows = windows.map(([a, b]) => {
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      let sum = 0; const i0 = a * SR | 0, i1 = b * SR | 0;
      for (let i = i0; i < i1; i++) sum += (L[i] * L[i] + R[i] * R[i]) / 2;
      return db(Math.sqrt(sum / (i1 - i0)));
    });
    return m;
  }

  const out = {};
  // Representative calls: each sound with the options the game really uses most.
  const cases = {
    hit: {}, 'hit heavy': ['hit', { pitch: 0.6 }], 'hit crit': ['hit', { pitch: 1.3 }],
    squish: {}, squeak: {}, splat: {}, thud: {}, slam: {}, pop: {}, hurt: {},
    bonk: ['bonk', { pitch: 0.8 }], 'bonk wall': ['bonk', { pitch: 0.5 }], boing: {},
    swing: {}, dodge: {}, grab: {}, throw: {}, glass: {}, clink: {}, windup: ['windup', { pitch: 1.3 }], spit: {},
    pickup: {}, potion: {}, levelup: {}, streak: {}, clear: {}, gate: {}, wave: {}, bloom: {},
    ragefull: {}, card: {}, sting: {}, parry: {}, death: {}, noir: {}, heartbeat: ['heartbeat', { vol: 1 }],
    whirl: {}, roar: {}, shriek: {}, enrage: {}, bossdie: {}, screech: {}, summon: {},
    scythedraw: {}, scythe: {}, chargerev: {}, bellow: {}, novacharge: {}, nova: {}, brood: {},
  };
  out.sounds = {};
  for (const [label, c] of Object.entries(cases)) {
    const [name, o] = Array.isArray(c) ? c : [label, c];
    out.sounds[label] = await render(2.6, s => fire(s, name, 0.05, o));
  }
  // A pile-up: a blender pass through a crowd. 24 kills in 0.4 s, each a hit, squish,
  // squeak and splat, as fast as the game can fire them.
  out.stress = await render(2, s => {
    for (let i = 0; i < 24; i++) {
      const t = 0.05 + i * 0.017;
      fire(s, 'hit', t, { pitch: 0.9 + (i % 3) * 0.1 }); fire(s, 'squish', t); fire(s, 'squeak', t, { pitch: 1 }); fire(s, 'splat', t + 0.005);
    }
  });
  // Music: drive the sequencer by hand (it normally pumps on a timer against currentTime).
  async function song(name, knobs, seconds = 8, then, windows) {
    return render(seconds, (s, ctx) => {
      let now = 0;
      Object.defineProperty(ctx, 'currentTime', { get: () => now });
      Object.defineProperty(ctx, 'state', { get: () => 'running' });
      const m = new Music(s);
      defineMusic(m);
      Object.assign(m, knobs);
      m.play(name); clearInterval(m.timer);
      for (now = 0; now < seconds - 0.2; now += 0.025) m.pump();
      then?.(s);
    }, windows);
  }
  out.music = {
    'garden calm': await song('garden', { intensity: 0.15, heat: 0 }),
    'garden fight': await song('garden', { intensity: 1, heat: 0 }),
    'garden machine': await song('garden', { intensity: 1, heat: 1.2 }),
    'empress': await song('empress', { intensity: 1, heat: 0 }),
  };
  // Ducking: the music alone, with a wall-splat duck (0.5 deep, 0.15 s hold) every 2 s.
  // Windows: 0.5 s before, the hold, and 0.3-0.8 s after (the swell back).
  if (Sfx.prototype.duck) {
    const w = [[1.5, 2.0], [2.03, 2.15], [2.3, 2.8], [2.8, 3.3]];
    seed = 777; const dry = await song('garden', { intensity: 1, heat: 0 }, 6, null, w);
    seed = 777; const wet = await song('garden', { intensity: 1, heat: 0 }, 6, s => { s.duck(0.5, 0.15, 0.5, 2.0); }, w);
    out.duck = wet.windows.map((x, i) => x - dry.windows[i]);
  }
  return out;
}, base);

const f = x => (x === -Infinity || x < -99 ? '  -inf' : x.toFixed(1).padStart(6));
const row = (k, m) => console.log(`${k.padEnd(16)} ${f(m.peak)} ${f(m.st)} ${f(m.phone)} ${f(m.low)}`);
console.log(`${'sound'.padEnd(16)}   peak     st  phone    low   (dBFS, base ${base || 'working tree'})`);
for (const [k, m] of Object.entries(result.sounds)) row(k, m);
row('STRESS x24', result.stress);
for (const [k, m] of Object.entries(result.music)) row('music ' + k, m);
if (result.duck) console.log('duck 0.5/0.15 s/0.5 s, music change in dB: ' + result.duck.map(f).join(' |') + '   (0.5 s before, hold, +0.3-0.8 s, +0.8-1.3 s)');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(result, null, 1));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
close();
