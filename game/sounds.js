// Every sound is synthesized: wet low-end for gore, bright chimes for rewards. The
// contrast is the joke.
export function defineSounds(s) {
  const P = o => o.pitch ?? 1;
  s.define('swing', (s, t, o) => s.noise(t, { dur: 0.12, vol: 0.18, f0: 700 * P(o), f1: 3500 * P(o), q: 2 }));
  s.define('hit', (s, t, o) => { s.noise(t, { dur: 0.16, vol: 0.5, f0: 1400 * P(o), f1: 180, q: 1.2, type: 'lowpass' }); s.thump(t, { f0: 190 * P(o), f1: 50, dur: 0.14, vol: 0.45, body: 0.35 }); });
  s.define('squish', (s, t) => { s.noise(t, { dur: 0.35, vol: 0.55, f0: 900, f1: 90, q: 3, type: 'lowpass' }); s.tone(t, { type: 'triangle', f0: 120, f1: 40, dur: 0.3, vol: 0.4 }); });
  s.define('squeak', (s, t, o) => s.tone(t + 0.03, { type: 'sine', f0: 1100 * P(o), f1: 1900 * P(o), dur: 0.12, vol: 0.18 }));
  s.define('splat', (s, t) => s.noise(t, { dur: 0.3, vol: 0.4, f0: 600, f1: 80, q: 4, type: 'lowpass' }));
  s.define('thud', (s, t) => s.thump(t, { f0: 140, f1: 45, dur: 0.12, vol: 0.3, body: 0.5 }));
  s.define('bonk', (s, t, o) => { s.tone(t, { type: 'square', f0: 330 * P(o), f1: 90 * P(o), dur: 0.14, vol: 0.18 }); s.tone(t, { type: 'sine', f0: 1320 * P(o), dur: 0.25, vol: 0.12 }); });
  // A spring, not a thud: the pitch climbs, then a second higher 'oing' rings on.
  s.define('boing', (s, t, o) => {
    s.tone(t, { type: 'sine', f0: 170 * P(o), f1: 620 * P(o), dur: 0.16, vol: 0.32 });
    s.tone(t + 0.07, { type: 'sine', f0: 330 * P(o), f1: 990 * P(o), dur: 0.22, vol: 0.2 });
    s.tone(t, { type: 'triangle', f0: 1318 * P(o), f1: 1760 * P(o), dur: 0.12, vol: 0.1 });
    s.tone(t + 0.04, { type: 'sine', f0: 2637 * P(o), dur: 0.3, vol: 0.05 });
  });
  s.define('slam', (s, t) => { s.thump(t, { f0: 90, f1: 28, dur: 0.5, vol: 0.6, body: 0.4 }); s.noise(t, { dur: 0.4, vol: 0.35, f0: 300, f1: 60, type: 'lowpass' }); });
  s.define('hurt', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 320, f1: 110, dur: 0.22, vol: 0.2 }); s.noise(t, { dur: 0.15, vol: 0.3, f0: 1200, f1: 300, type: 'lowpass' }); });
  s.define('dodge', (s, t) => s.noise(t, { dur: 0.18, vol: 0.15, f0: 400, f1: 2400, q: 1.5 }));
  s.define('pickup', (s, t, o) => s.tone(t, { type: 'triangle', f0: 1046 * P(o), f1: 1568 * P(o), dur: 0.09, vol: 0.12 }));
  s.define('potion', (s, t) => [523, 659, 784].forEach((f, i) => s.tone(t + i * 0.06, { type: 'sine', f0: f, dur: 0.2, vol: 0.15 })));
  s.define('levelup', (s, t) => [523, 659, 784, 1046, 1318].forEach((f, i) => s.tone(t + i * 0.07, { type: 'triangle', f0: f, dur: 0.3, vol: 0.16 })));
  s.define('streak', (s, t, o) => [784, 988, 1175].forEach((f, i) => s.tone(t + i * 0.05, { type: 'square', f0: f * P(o), dur: 0.1, vol: 0.06 })));
  s.define('clear', (s, t) => [392, 523, 659, 784, 1046].forEach((f, i) => s.tone(t + i * 0.09, { type: 'triangle', f0: f, dur: 0.5, vol: 0.15 })));
  s.define('gate', (s, t) => { s.tone(t, { type: 'square', f0: 110, f1: 70, dur: 0.3, vol: 0.15 }); s.noise(t, { dur: 0.3, vol: 0.2, f0: 500, f1: 200, type: 'lowpass' }); });
  s.define('wave', (s, t) => [659, 523, 659, 784].forEach((f, i) => s.tone(t + i * 0.08, { type: 'square', f0: f, dur: 0.12, vol: 0.07 })));
  s.define('windup', (s, t, o) => s.tone(t, { type: 'sine', f0: 300 * P(o), f1: 700 * P(o), dur: 0.3, vol: 0.08 }));
  s.define('spit', (s, t) => s.tone(t, { type: 'sine', f0: 900, f1: 300, dur: 0.12, vol: 0.12 }));
  s.define('grab', (s, t) => s.tone(t, { type: 'triangle', f0: 600, f1: 900, dur: 0.1, vol: 0.15 }));
  s.define('throw', (s, t) => s.noise(t, { dur: 0.3, vol: 0.25, f0: 300, f1: 2000, q: 1 }));
  s.define('glass', (s, t) => { for (let i = 0; i < 5; i++) s.tone(t + i * 0.02, { type: 'sine', f0: 2000 + Math.random() * 2000, dur: 0.15, vol: 0.06 }); });
  s.define('pop', (s, t) => { s.tone(t, { type: 'sine', f0: 600, f1: 80, dur: 0.15, vol: 0.4 }); s.noise(t, { dur: 0.2, vol: 0.3, f0: 3000, f1: 500 }); });
  s.define('whirl', (s, t) => s.noise(t, { dur: 2.4, vol: 0.2, f0: 400, f1: 2400, q: 3 }));
  s.define('screech', (s, t, o) => { s.tone(t, { type: 'sawtooth', f0: 900 * P(o), f1: 1400 * P(o), dur: 0.5, vol: 0.12 }); s.tone(t, { type: 'square', f0: 1210 * P(o), f1: 1900 * P(o), dur: 0.5, vol: 0.05 }); });
  s.define('roar', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 160, f1: 60, dur: 1.0, vol: 0.25 }); s.noise(t, { dur: 0.9, vol: 0.3, f0: 800, f1: 100, type: 'lowpass' }); });
  s.define('summon', (s, t) => [880, 660, 990].forEach((f, i) => s.tone(t + i * 0.1, { type: 'triangle', f0: f, dur: 0.15, vol: 0.1 })));
  s.define('parry', (s, t) => { s.tone(t, { type: 'triangle', f0: 1568, dur: 0.5, vol: 0.22 }); s.tone(t, { type: 'sine', f0: 2349, dur: 0.35, vol: 0.12 }); s.tone(t + 0.04, { type: 'sine', f0: 3136, dur: 0.25, vol: 0.06 }); });
  s.define('noir', (s, t) => { s.thump(t, { f0: 110, f1: 55, dur: 1.2, vol: 0.35, body: 0.35 }); s.noise(t, { dur: 0.8, vol: 0.12, f0: 300, f1: 80, type: 'lowpass' }); s.tone(t + 0.05, { type: 'triangle', f0: 880, f1: 440, dur: 0.6, vol: 0.06 }); });
  // Tutorial: a bright little 'got it' for each lesson, and a soft chime for the next card.
  s.define('sting', (s, t) => { [784, 988, 1175, 1568].forEach((f, i) => s.tone(t + i * 0.055, { type: 'triangle', f0: f, dur: 0.35, vol: 0.15 })); s.tone(t + 0.22, { type: 'sine', f0: 2349, f1: 3136, dur: 0.4, vol: 0.07 }); s.noise(t, { dur: 0.25, vol: 0.1, f0: 5000, f1: 9000, q: 2 }); });
  s.define('card', (s, t) => { s.tone(t, { type: 'sine', f0: 660, dur: 0.12, vol: 0.09 }); s.tone(t + 0.07, { type: 'sine', f0: 990, dur: 0.2, vol: 0.09 }); });
  // Lub-dub: two soft sub thumps, quiet enough to sit under the fight.
  s.define('heartbeat', (s, t, o) => { s.thump(t, { f0: 72, f1: 44, dur: 0.16, vol: 0.32 * (o.vol ?? 1), body: 0.8 }); s.thump(t + 0.17, { f0: 62, f1: 40, dur: 0.2, vol: 0.22 * (o.vol ?? 1), body: 0.8 }); });
  s.define('bloom', (s, t, o) => { s.tone(t, { type: 'sine', f0: 380 * P(o), f1: 1150 * P(o), dur: 0.16, vol: 0.14 }); s.noise(t, { dur: 0.12, vol: 0.14, f0: 2500, f1: 900 }); });
  s.define('ragefull', (s, t) => [1046, 1318, 1568, 2093].forEach((f, i) => s.tone(t + i * 0.045, { type: 'triangle', f0: f, dur: 0.22, vol: 0.09 })));
  // The Empress: one voice per attack, so you can fight her with your eyes shut.
  s.define('scythedraw', (s, t, o) => { s.tone(t, { type: 'triangle', f0: 1400 * P(o), f1: 2800 * P(o), dur: 0.45, vol: 0.09, attack: 0.2 }); s.noise(t, { dur: 0.45, vol: 0.12, f0: 3000, f1: 7000, q: 6 }); });
  s.define('scythe', (s, t) => { s.noise(t, { dur: 0.28, vol: 0.4, f0: 500, f1: 4000, q: 1.5 }); s.tone(t, { type: 'triangle', f0: 2637, f1: 2200, dur: 0.35, vol: 0.12 }); s.tone(t, { type: 'square', f0: 180, f1: 70, dur: 0.18, vol: 0.12 }); });
  s.define('chargerev', (s, t, o) => { s.tone(t, { type: 'sawtooth', f0: 48 * P(o), f1: 130 * P(o), dur: 0.9, vol: 0.2, attack: 0.3 }); s.noise(t, { dur: 0.9, vol: 0.25, f0: 150, f1: 700, type: 'lowpass' }); for (let i = 0; i < 4; i++) s.thump(t + i * 0.2 / P(o), { f0: 110, f1: 40, dur: 0.12, vol: 0.3, body: 0.4 }); });
  s.define('bellow', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 220, f1: 70, dur: 0.7, vol: 0.25 }); s.tone(t, { type: 'square', f0: 110, f1: 45, dur: 0.6, vol: 0.12 }); s.noise(t, { dur: 0.5, vol: 0.25, f0: 1200, f1: 200, type: 'lowpass' }); });
  s.define('novacharge', (s, t, o) => [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => s.tone(t + i * 0.12 / P(o), { type: 'triangle', f0: f * P(o), dur: 0.18, vol: 0.06 + i * 0.012 })));
  s.define('nova', (s, t) => { s.tone(t, { type: 'sine', f0: 2349, f1: 1175, dur: 0.4, vol: 0.18 }); s.tone(t, { type: 'triangle', f0: 3136, f1: 1568, dur: 0.3, vol: 0.08 }); s.noise(t, { dur: 0.35, vol: 0.22, f0: 6000, f1: 1500, q: 0.8 }); });
  s.define('brood', (s, t) => { s.noise(t, { dur: 0.6, vol: 0.4, f0: 500, f1: 120, q: 7, type: 'lowpass' }); for (let i = 0; i < 3; i++) s.tone(t + i * 0.13, { type: 'sine', f0: 140 + i * 40, f1: 60, dur: 0.12, vol: 0.25 }); });
  s.define('shriek', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 700, f1: 1700, dur: 0.75, vol: 0.14, attack: 0.05 }); s.tone(t, { type: 'square', f0: 940, f1: 2300, dur: 0.75, vol: 0.06 }); s.tone(t + 0.4, { type: 'sawtooth', f0: 1700, f1: 900, dur: 0.5, vol: 0.1 }); });
  s.define('enrage', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 130, f1: 45, dur: 1.2, vol: 0.3 }); s.tone(t, { type: 'sawtooth', f0: 900, f1: 2000, dur: 0.6, vol: 0.1 }); s.noise(t, { dur: 1.1, vol: 0.35, f0: 900, f1: 80, type: 'lowpass' }); s.thump(t, { f0: 70, f1: 30, dur: 0.9, vol: 0.5, body: 0.35 }); });
  s.define('bossdie', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 500, f1: 2600, dur: 0.7, vol: 0.16 }); s.tone(t, { type: 'square', f0: 660, f1: 3300, dur: 0.7, vol: 0.06 }); s.noise(t, { dur: 0.7, vol: 0.2, f0: 800, f1: 5000, q: 2 }); });
  s.define('clink', (s, t, o) => { s.tone(t, { type: 'sine', f0: 2093 * P(o), dur: 0.3, vol: 0.14 }); s.tone(t, { type: 'triangle', f0: 3136 * P(o), dur: 0.18, vol: 0.06 }); });
  s.define('death', (s, t) => [392, 330, 262, 196].forEach((f, i) => s.tone(t + i * 0.18, { type: 'triangle', f0: f, dur: 0.4, vol: 0.18 })));
  // The pond. Water is noise through a lowpass that opens and shuts; a plop is a sine that
  // falls then rises (the bubble closing).
  s.define('splash', (s, t, o) => { s.noise(t, { dur: 0.45, vol: 0.45, f0: 3200 * P(o), f1: 500, q: 0.8, type: 'lowpass' }); s.tone(t, { type: 'sine', f0: 700 * P(o), f1: 220 * P(o), dur: 0.09, vol: 0.25 }); s.tone(t + 0.07, { type: 'sine', f0: 380 * P(o), f1: 900 * P(o), dur: 0.1, vol: 0.14 }); });
  s.define('croak', (s, t, o) => { for (let i = 0; i < 3; i++) s.tone(t + i * 0.07, { type: 'sawtooth', f0: 150 * P(o), f1: 95 * P(o), dur: 0.08, vol: 0.14, lp: [900, 900] }); });
  s.define('hop', (s, t) => { s.tone(t, { type: 'sine', f0: 240, f1: 520, dur: 0.12, vol: 0.18 }); s.noise(t, { dur: 0.1, vol: 0.12, f0: 900, f1: 2400, q: 1 }); });
  s.define('tongue', (s, t) => { s.tone(t, { type: 'triangle', f0: 300, f1: 1400, dur: 0.1, vol: 0.18 }); s.noise(t, { dur: 0.12, vol: 0.18, f0: 1800, f1: 5000, q: 2 }); s.tone(t + 0.1, { type: 'sine', f0: 900, f1: 200, dur: 0.18, vol: 0.12 }); });
  s.define('gulp', (s, t, o) => { s.tone(t, { type: 'sine', f0: 320 * P(o), f1: 110 * P(o), dur: 0.16, vol: 0.4 }); s.tone(t + 0.12, { type: 'sine', f0: 180 * P(o), f1: 70 * P(o), dur: 0.2, vol: 0.3 }); });
  s.define('flop', (s, t) => { s.thump(t, { f0: 120, f1: 40, dur: 0.35, vol: 0.55, body: 0.5 }); s.noise(t, { dur: 0.3, vol: 0.35, f0: 1400, f1: 200, q: 2, type: 'lowpass' }); s.tone(t + 0.05, { type: 'sine', f0: 500, f1: 260, dur: 0.12, vol: 0.12 }); });
  s.define('breachrev', (s, t, o) => { s.noise(t, { dur: 1.0, vol: 0.3, f0: 200, f1: 2600 * P(o), q: 1.5, type: 'lowpass' }); for (let i = 0; i < 5; i++) s.tone(t + i * 0.16 / P(o), { type: 'sine', f0: 300 + i * 90, f1: 160, dur: 0.1, vol: 0.12 }); });
  s.define('bubbles', (s, t) => { for (let i = 0; i < 7; i++) s.tone(t + i * 0.08 + Math.random() * 0.03, { type: 'sine', f0: 500 + Math.random() * 500, f1: 1200 + Math.random() * 600, dur: 0.07, vol: 0.12 }); });
  // The hive. A bee is a buzzing saw through a resonant lowpass.
  s.define('buzz', (s, t, o) => s.tone(t, { type: 'sawtooth', f0: 210 * P(o), f1: 240 * P(o), dur: 0.35, vol: 0.06, attack: 0.05, vib: [28, 40, 0], lp: [1600, 1600, 0, 4] }));
  s.define('hivehit', (s, t) => { s.thump(t, { f0: 160, f1: 70, dur: 0.18, vol: 0.35, body: 0.6 }); s.noise(t, { dur: 0.25, vol: 0.2, f0: 800, f1: 300, q: 3, type: 'lowpass' }); s.tone(t, { type: 'sawtooth', f0: 260, f1: 330, dur: 0.4, vol: 0.06, vib: [30, 50, 0] }); });
  s.define('hivebreak', (s, t) => { s.noise(t, { dur: 0.6, vol: 0.5, f0: 2400, f1: 200, q: 1, type: 'lowpass' }); s.thump(t, { f0: 110, f1: 35, dur: 0.5, vol: 0.5, body: 0.5 }); for (let i = 0; i < 4; i++) s.tone(t + 0.1 + i * 0.07, { type: 'sawtooth', f0: 300 + i * 60, f1: 180, dur: 0.25, vol: 0.05, vib: [32, 60, 0] }); });
  s.define('puff', (s, t) => { s.noise(t, { dur: 0.5, vol: 0.55, f0: 4000, f1: 300, q: 0.7, type: 'lowpass' }); s.thump(t, { f0: 95, f1: 32, dur: 0.4, vol: 0.55, body: 0.45 }); s.tone(t, { type: 'sine', f0: 900, f1: 120, dur: 0.18, vol: 0.2 }); });
  s.define('royal', (s, t) => { [392, 494, 587, 784].forEach((f, i) => s.tone(t + i * 0.11, { type: 'square', f0: f, dur: 0.22, vol: 0.06, lp: [2400, 2400] })); s.tone(t + 0.45, { type: 'sawtooth', f0: 220, f1: 260, dur: 0.9, vol: 0.1, vib: [24, 60, 0], lp: [1400, 1400, 0, 3] }); });
  s.define('stingvolley', (s, t, o) => { for (let i = 0; i < 3; i++) s.noise(t + i * 0.04, { dur: 0.08, vol: 0.18, f0: 3000 * P(o), f1: 6000 * P(o), q: 3 }); s.tone(t, { type: 'sawtooth', f0: 330 * P(o), f1: 200 * P(o), dur: 0.2, vol: 0.08, vib: [30, 40, 0] }); });
  s.define('dive', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 900, f1: 160, dur: 0.55, vol: 0.14, vib: [30, 60, 0], lp: [2200, 2200] }); s.noise(t, { dur: 0.55, vol: 0.2, f0: 5000, f1: 400, q: 1 }); });

  // The mix, measured with tools/mix.mjs (short-term loudness, loudest 50 ms, dBFS through
  // the master chain). Windows: core combat hits about -21, big moments -15 to -19, UI
  // chimes -24 to -26, foley -28 to -31 (frequent, so under the hits but over the music,
  // which sits around -30). `db` is the trim that puts each sound in its window.
  const GORE = 'gore';
  const MIX = {
    hit: { db: -0.5, voices: 4, group: GORE }, squish: { db: -2, voices: 3, group: GORE }, squeak: { db: 1, voices: 3, group: GORE },
    splat: { db: 7.5, voices: 4, group: GORE }, thud: { db: 0, voices: 3, group: GORE }, pop: { db: -0.5, voices: 3, group: GORE },
    slam: { db: -2.5, voices: 2, group: GORE, duck: [0.4, 0.15, 0.5] }, bonk: { db: 2.5, voices: 3, group: GORE },
    hurt: { db: 7, voices: 2 }, boing: { db: -0.5, voices: 3 }, glass: { db: 4, voices: 2 }, clink: { db: 0.5, voices: 3 },
    swing: { db: 18.5, voices: 3 }, dodge: { db: 17.5, voices: 2 }, grab: { db: 4.5, voices: 2 }, throw: { db: 11, voices: 2 },
    whirl: { db: 9, voices: 1 }, windup: { db: 7.5, voices: 3 }, spit: { db: 7, voices: 3 },
    pickup: { db: 7, voices: 4 }, potion: { db: -1.5, voices: 1 }, streak: { db: 7.5, voices: 1 }, wave: { db: 5, voices: 1 },
    bloom: { db: 4, voices: 3 }, ragefull: { db: 3.5, voices: 1 }, card: { db: 2.5, voices: 1 }, gate: { db: 1.5, voices: 1 },
    levelup: { db: -0.5, voices: 1, duck: [0.4, 0.6, 0.8] }, clear: { db: -1.5, voices: 1, duck: [0.4, 0.8, 1] },
    sting: { db: -1, voices: 1, duck: [0.35, 0.4, 0.6] }, parry: { db: 2, voices: 2, duck: [0.45, 0.2, 0.6] },
    death: { db: 2.5, voices: 1, duck: [0.8, 1.5, 2] }, noir: { db: -1.5, voices: 1, duck: [0.5, 0.4, 1] },
    heartbeat: { db: -4.5, voices: 1 },
    roar: { db: 3.5, voices: 1, duck: [0.6, 0.9, 1.2] }, shriek: { db: 2.5, voices: 1 }, enrage: { db: -2, voices: 1, duck: [0.7, 0.8, 1.5] },
    bossdie: { db: 5.5, voices: 1, duck: [0.85, 1.6, 2.5] }, screech: { db: 4.5, voices: 2 }, summon: { db: 5.5, voices: 1 },
    scythedraw: { db: 3.5, voices: 1 }, scythe: { db: 4.5, voices: 1 }, chargerev: { db: -1.5, voices: 1 }, bellow: { db: 1.5, voices: 1 },
    novacharge: { db: 4.5, voices: 1 }, nova: { db: 1.5, voices: 1 }, brood: { db: 0, voices: 1 },
    // Untested by meter so far: trims are first guesses beside their nearest relatives.
    splash: { db: 2, voices: 3, group: GORE }, croak: { db: 5, voices: 2 }, hop: { db: 6, voices: 3 }, tongue: { db: 4, voices: 2 },
    gulp: { db: 2, voices: 2 }, flop: { db: -1.5, voices: 1, duck: [0.4, 0.2, 0.6] }, breachrev: { db: 2, voices: 1 }, bubbles: { db: 4, voices: 1 },
    buzz: { db: 3, voices: 3 }, hivehit: { db: 1, voices: 2 }, hivebreak: { db: 0, voices: 2, duck: [0.45, 0.2, 0.6] }, puff: { db: -1, voices: 3, group: GORE, duck: [0.35, 0.15, 0.5] },
    royal: { db: 2, voices: 1, duck: [0.6, 0.9, 1.2] }, stingvolley: { db: 4, voices: 2 }, dive: { db: 1.5, voices: 1 },
  };
  for (const [name, mix] of Object.entries(MIX)) {
    if (!s.recipes[name]) throw new Error(`sounds: mix names unknown sound ${name}`);
    s.mix[name] = mix;
  }
  for (const name in s.recipes) if (!MIX[name]) throw new Error(`sounds: ${name} has no mix entry`);
}
