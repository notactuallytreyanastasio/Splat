// Every sound is synthesized: wet low-end for gore, bright chimes for rewards. The
// contrast is the joke.
export function defineSounds(s) {
  const P = o => o.pitch ?? 1;
  s.define('swing', (s, t, o) => s.noise(t, { dur: 0.12, vol: 0.18, f0: 700 * P(o), f1: 3500 * P(o), q: 2 }));
  s.define('hit', (s, t, o) => { s.noise(t, { dur: 0.16, vol: 0.5, f0: 1400 * P(o), f1: 180, q: 1.2, type: 'lowpass' }); s.tone(t, { type: 'sine', f0: 190 * P(o), f1: 50, dur: 0.14, vol: 0.45 }); });
  s.define('squish', (s, t) => { s.noise(t, { dur: 0.35, vol: 0.55, f0: 900, f1: 90, q: 3, type: 'lowpass' }); s.tone(t, { type: 'triangle', f0: 120, f1: 40, dur: 0.3, vol: 0.4 }); });
  s.define('squeak', (s, t, o) => s.tone(t + 0.03, { type: 'sine', f0: 1100 * P(o), f1: 1900 * P(o), dur: 0.12, vol: 0.18 }));
  s.define('splat', (s, t) => s.noise(t, { dur: 0.3, vol: 0.4, f0: 600, f1: 80, q: 4, type: 'lowpass' }));
  s.define('thud', (s, t) => s.tone(t, { type: 'sine', f0: 140, f1: 45, dur: 0.12, vol: 0.3 }));
  s.define('bonk', (s, t, o) => { s.tone(t, { type: 'square', f0: 330 * P(o), f1: 90 * P(o), dur: 0.14, vol: 0.18 }); s.tone(t, { type: 'sine', f0: 1320 * P(o), dur: 0.25, vol: 0.12 }); });
  // A spring, not a thud: the pitch climbs, then a second higher 'oing' rings on.
  s.define('boing', (s, t, o) => {
    s.tone(t, { type: 'sine', f0: 170 * P(o), f1: 620 * P(o), dur: 0.16, vol: 0.32 });
    s.tone(t + 0.07, { type: 'sine', f0: 330 * P(o), f1: 990 * P(o), dur: 0.22, vol: 0.2 });
    s.tone(t, { type: 'triangle', f0: 1318 * P(o), f1: 1760 * P(o), dur: 0.12, vol: 0.1 });
    s.tone(t + 0.04, { type: 'sine', f0: 2637 * P(o), dur: 0.3, vol: 0.05 });
  });
  s.define('slam', (s, t) => { s.tone(t, { type: 'sine', f0: 90, f1: 28, dur: 0.5, vol: 0.6 }); s.noise(t, { dur: 0.4, vol: 0.35, f0: 300, f1: 60, type: 'lowpass' }); });
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
  s.define('noir', (s, t) => { s.tone(t, { type: 'sine', f0: 110, f1: 55, dur: 1.2, vol: 0.35 }); s.noise(t, { dur: 0.8, vol: 0.12, f0: 300, f1: 80, type: 'lowpass' }); s.tone(t + 0.05, { type: 'triangle', f0: 880, f1: 440, dur: 0.6, vol: 0.06 }); });
  // Tutorial: a bright little 'got it' for each lesson, and a soft chime for the next card.
  s.define('sting', (s, t) => { [784, 988, 1175, 1568].forEach((f, i) => s.tone(t + i * 0.055, { type: 'triangle', f0: f, dur: 0.35, vol: 0.15 })); s.tone(t + 0.22, { type: 'sine', f0: 2349, f1: 3136, dur: 0.4, vol: 0.07 }); s.noise(t, { dur: 0.25, vol: 0.1, f0: 5000, f1: 9000, q: 2 }); });
  s.define('card', (s, t) => { s.tone(t, { type: 'sine', f0: 660, dur: 0.12, vol: 0.09 }); s.tone(t + 0.07, { type: 'sine', f0: 990, dur: 0.2, vol: 0.09 }); });
  // Lub-dub: two soft sub thumps, quiet enough to sit under the fight.
  s.define('heartbeat', (s, t, o) => { s.tone(t, { type: 'sine', f0: 72, f1: 44, dur: 0.16, vol: 0.32 * (o.vol ?? 1) }); s.tone(t + 0.17, { type: 'sine', f0: 62, f1: 40, dur: 0.2, vol: 0.22 * (o.vol ?? 1) }); });
  s.define('bloom', (s, t, o) => { s.tone(t, { type: 'sine', f0: 380 * P(o), f1: 1150 * P(o), dur: 0.16, vol: 0.14 }); s.noise(t, { dur: 0.12, vol: 0.14, f0: 2500, f1: 900 }); });
  s.define('ragefull', (s, t) => [1046, 1318, 1568, 2093].forEach((f, i) => s.tone(t + i * 0.045, { type: 'triangle', f0: f, dur: 0.22, vol: 0.09 })));
  // The Empress: one voice per attack, so you can fight her with your eyes shut.
  s.define('scythedraw', (s, t, o) => { s.tone(t, { type: 'triangle', f0: 1400 * P(o), f1: 2800 * P(o), dur: 0.45, vol: 0.09, attack: 0.2 }); s.noise(t, { dur: 0.45, vol: 0.12, f0: 3000, f1: 7000, q: 6 }); });
  s.define('scythe', (s, t) => { s.noise(t, { dur: 0.28, vol: 0.4, f0: 500, f1: 4000, q: 1.5 }); s.tone(t, { type: 'triangle', f0: 2637, f1: 2200, dur: 0.35, vol: 0.12 }); s.tone(t, { type: 'square', f0: 180, f1: 70, dur: 0.18, vol: 0.12 }); });
  s.define('chargerev', (s, t, o) => { s.tone(t, { type: 'sawtooth', f0: 48 * P(o), f1: 130 * P(o), dur: 0.9, vol: 0.2, attack: 0.3 }); s.noise(t, { dur: 0.9, vol: 0.25, f0: 150, f1: 700, type: 'lowpass' }); for (let i = 0; i < 4; i++) s.tone(t + i * 0.2 / P(o), { type: 'sine', f0: 110, f1: 40, dur: 0.12, vol: 0.3 }); });
  s.define('bellow', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 220, f1: 70, dur: 0.7, vol: 0.25 }); s.tone(t, { type: 'square', f0: 110, f1: 45, dur: 0.6, vol: 0.12 }); s.noise(t, { dur: 0.5, vol: 0.25, f0: 1200, f1: 200, type: 'lowpass' }); });
  s.define('novacharge', (s, t, o) => [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => s.tone(t + i * 0.12 / P(o), { type: 'triangle', f0: f * P(o), dur: 0.18, vol: 0.06 + i * 0.012 })));
  s.define('nova', (s, t) => { s.tone(t, { type: 'sine', f0: 2349, f1: 1175, dur: 0.4, vol: 0.18 }); s.tone(t, { type: 'triangle', f0: 3136, f1: 1568, dur: 0.3, vol: 0.08 }); s.noise(t, { dur: 0.35, vol: 0.22, f0: 6000, f1: 1500, q: 0.8 }); });
  s.define('brood', (s, t) => { s.noise(t, { dur: 0.6, vol: 0.4, f0: 500, f1: 120, q: 7, type: 'lowpass' }); for (let i = 0; i < 3; i++) s.tone(t + i * 0.13, { type: 'sine', f0: 140 + i * 40, f1: 60, dur: 0.12, vol: 0.25 }); });
  s.define('shriek', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 700, f1: 1700, dur: 0.75, vol: 0.14, attack: 0.05 }); s.tone(t, { type: 'square', f0: 940, f1: 2300, dur: 0.75, vol: 0.06 }); s.tone(t + 0.4, { type: 'sawtooth', f0: 1700, f1: 900, dur: 0.5, vol: 0.1 }); });
  s.define('enrage', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 130, f1: 45, dur: 1.2, vol: 0.3 }); s.tone(t, { type: 'sawtooth', f0: 900, f1: 2000, dur: 0.6, vol: 0.1 }); s.noise(t, { dur: 1.1, vol: 0.35, f0: 900, f1: 80, type: 'lowpass' }); s.tone(t, { type: 'sine', f0: 70, f1: 30, dur: 0.9, vol: 0.5 }); });
  s.define('bossdie', (s, t) => { s.tone(t, { type: 'sawtooth', f0: 500, f1: 2600, dur: 0.7, vol: 0.16 }); s.tone(t, { type: 'square', f0: 660, f1: 3300, dur: 0.7, vol: 0.06 }); s.noise(t, { dur: 0.7, vol: 0.2, f0: 800, f1: 5000, q: 2 }); });
  s.define('clink', (s, t, o) => { s.tone(t, { type: 'sine', f0: 2093 * P(o), dur: 0.3, vol: 0.14 }); s.tone(t, { type: 'triangle', f0: 3136 * P(o), dur: 0.18, vol: 0.06 }); });
  s.define('death', (s, t) => [392, 330, 262, 196].forEach((f, i) => s.tone(t + i * 0.18, { type: 'triangle', f0: f, dur: 0.4, vol: 0.18 })));
}
