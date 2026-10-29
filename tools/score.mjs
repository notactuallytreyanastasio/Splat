// Render the soundtrack to WAV files and spectrograms, so it can be listened to (and
// looked at) without playing the game. Each scene drives the real Music sequencer
// through a knob timeline in an OfflineAudioContext, in headless Chromium.
//
//   node tools/score.mjs                 # every scene -> tools/out/score/<scene>.wav + .png
//   node tools/score.mjs journey calm    # only these scenes
//
// The PNG is a log-frequency spectrogram (50 Hz to 12 kHz, bottom to top) with the
// knob timeline drawn under it: intensity in pink, heat in orange, color in teal.
import { launch } from './browser.mjs';
import { startServer } from './serve.mjs';
import fs from 'node:fs';

// [seconds, { knob: value }] keyframes, linearly interpolated.
const SCENES = {
  calm: { song: 'garden', seconds: 75, keys: [[0, { intensity: 0.1, heat: 0, color: 1 }]] },
  fight: { song: 'garden', seconds: 45, keys: [[0, { intensity: 0.2, heat: 0 }], [6, { intensity: 1 }]] },
  journey: { song: 'garden', seconds: 100, keys: [[0, { intensity: 0.1, heat: 0, color: 1 }], [18, { intensity: 0.2 }], [24, { intensity: 1 }],
    [40, { heat: 0.3, color: 0.8 }], [50, { heat: 1.25, color: 0.3 }], [72, { heat: 1.25, color: 0.3 }], [80, { heat: 0.1, color: 0.9 }], [100, { intensity: 0.4, heat: 0 }]] },
  machine: { song: 'garden', seconds: 75, keys: [[0, { intensity: 1, heat: 1.3, color: 0.2 }]] },
  empress: { song: 'empress', seconds: 60, keys: [[0, { intensity: 1, heat: 0 }]] },
  victory: { song: 'victory', seconds: 22, keys: [[0, { intensity: 0, heat: 0 }]] },
  // A fight with kills (killsong.js): singles, a spree, a blender pass, then a machine spree.
  spree: { song: 'garden', seconds: 70, keys: [[0, { intensity: 1, heat: 0, color: 1 }], [30, { heat: 0.4, color: 0.8 }], [40, { heat: 1.2, color: 0.3 }], [70, { heat: 1.2 }]],
    kills: [[4, 1], [6.5, 1], [9, 1], [12, 1], [12.6, 1], [13.1, 2], [13.9, 1], [14.5, 1], [15.2, 1], [16, 3], [16.8, 1], [17.5, 1],
      [24, 8], [24.2, 6], [24.4, 10], [45, 1], [45.5, 1], [46, 2], [46.6, 1], [47.4, 1], [48, 3], [49, 1], [50, 1], [51, 2], [52, 1], [60, 12]] },
  empressSpree: { song: 'empress', seconds: 30, keys: [[0, { intensity: 1, heat: 0 }]],
    kills: [[3, 1], [4, 1], [5, 2], [6, 1], [7, 1], [8, 3], [9, 1], [15, 6], [16, 1], [17, 1], [18, 2]] },
};
const pick = process.argv.slice(2);
const scenes = pick.length ? Object.fromEntries(pick.map(k => { if (!SCENES[k]) throw new Error(`score: no scene ${k}`); return [k, SCENES[k]]; })) : SCENES;

const dir = new URL('./out/score/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
const { url, close } = await startServer();
const browser = await launch();
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(e.message));
tab.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await tab.goto(url + '/tools/serve.mjs');

for (const [name, sc] of Object.entries(scenes)) {
  const t0 = performance.now();
  const r = await tab.evaluate(async sc => {
    let seed = 4242;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const { Sfx } = await import('/engine/audio/sfx.js');
    const { defineSounds } = await import('/game/sounds.js');
    const { Music } = await import('/engine/audio/music.js');
    const { defineMusic } = await import('/game/music.js');
    const { KillSong } = await import('/game/killsong.js');
    const SR = 44100, ctx = new OfflineAudioContext(2, SR * sc.seconds, SR);
    const s = new Sfx(); defineSounds(s); s.attach(ctx);
    let now = 0;
    Object.defineProperty(ctx, 'currentTime', { get: () => now });
    Object.defineProperty(ctx, 'state', { get: () => 'running' });
    const m = new Music(s); defineMusic(m);
    const knobs = ['intensity', 'heat', 'color'];
    const at = t => {
      const o = {};
      for (const k of knobs) {
        const ks = sc.keys.filter(([, v]) => v[k] != null);
        if (!ks.length) { o[k] = k === 'color' ? 1 : 0; continue; }
        let v = ks[0][1][k];
        for (let i = 0; i < ks.length; i++) {
          const [ta, va] = ks[i], nx = ks[i + 1];
          if (t >= ta) v = nx && t < nx[0] ? va[k] + (nx[1][k] - va[k]) * (t - ta) / (nx[0] - ta) : va[k];
        }
        o[k] = v;
      }
      return o;
    };
    Object.assign(m, at(0));
    m.play(sc.song); clearInterval(m.timer);
    const ks = new KillSong(m), kills = [...(sc.kills ?? [])];
    const sections = [];
    for (now = 0; now < sc.seconds - 0.3; now += 0.025) {
      const k = at(now);
      Object.assign(m, k);
      // The game's tone filter follows color the same way (game.js updateGrade).
      m.setTone(2600 + k.color * k.color * 17400);
      const before = m.section;
      while (kills.length && kills[0][0] <= now) { const [, n] = kills.shift(); for (let i = 0; i < n; i++) ks.kill(n > 2); }
      ks.update(0.025);
      m.pump();
      if (m.section !== before || !sections.length) sections.push([+now.toFixed(2), m.section]);
    }
    const r0 = performance.now(), buf = await ctx.startRendering(), renderMs = performance.now() - r0;
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    // 16-bit WAV.
    const n = L.length, wav = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, x) => { for (let i = 0; i < x.length; i++) wav.setUint8(o + i, x.charCodeAt(i)); };
    str(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true); wav.setUint16(22, 2, true); wav.setUint32(24, SR, true); wav.setUint32(28, SR * 4, true);
    wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); str(36, 'data'); wav.setUint32(40, n * 4, true);
    let peak = 0, clip = 0;
    for (let i = 0; i < n; i++) {
      const a = L[i], b = R[i]; peak = Math.max(peak, Math.abs(a), Math.abs(b));
      if (Math.abs(a) >= 1 || Math.abs(b) >= 1) clip++;
      wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, a)) * 32767, true);
      wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, b)) * 32767, true);
    }
    // Spectrogram: 2048-point FFT, hop 1024, log frequency rows.
    const N = 2048, hop = 1024, cols = Math.floor((n - N) / hop), rows = 360;
    const cv = new OffscreenCanvas(cols, rows + 60), g = cv.getContext('2d');
    const img = g.createImageData(cols, rows);
    const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    const re = new Float32Array(N), im = new Float32Array(N);
    const fft = () => {
      for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= N; len <<= 1) {
        const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
        for (let i = 0; i < N; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) {
            const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
            re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
            const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
          }
        }
      }
    };
    for (let c = 0; c < cols; c++) {
      for (let i = 0; i < N; i++) { re[i] = (L[c * hop + i] + R[c * hop + i]) * 0.5 * win[i]; im[i] = 0; }
      fft();
      for (let y = 0; y < rows; y++) {
        const f = 50 * Math.pow(12000 / 50, 1 - y / rows), bin = Math.min(N / 2 - 1, Math.round(f * N / SR));
        const mag = Math.hypot(re[bin], im[bin]), d = 20 * Math.log10(mag + 1e-9);
        const v = Math.max(0, Math.min(1, (d + 50) / 60));
        const o = (y * cols + c) * 4;
        img.data[o] = 255 * Math.min(1, v * 1.6); img.data[o + 1] = 255 * Math.max(0, v * 1.6 - 0.6); img.data[o + 2] = 255 * Math.max(0, 0.5 - Math.abs(v - 0.35)) * 2; img.data[o + 3] = 255;
      }
    }
    g.fillStyle = '#111'; g.fillRect(0, 0, cols, rows + 60);
    g.putImageData(img, 0, 0);
    const colsPerSec = SR / hop;
    for (const [k, col] of [['intensity', '#ff8fc8'], ['heat', '#ffb060'], ['color', '#60e0c8']]) {
      g.strokeStyle = col; g.beginPath();
      for (let c = 0; c < cols; c += 2) { const v = at(c / colsPerSec)[k]; const y = rows + 56 - Math.min(1.3, v) / 1.3 * 50; c ? g.lineTo(c, y) : g.moveTo(c, y); }
      g.stroke();
    }
    g.fillStyle = '#fff'; g.font = '11px sans-serif';
    for (const [t, sec] of sections) { const x = t * colsPerSec; g.fillRect(x, 0, 1, rows); g.fillText(sec, x + 3, 12); }
    g.fillStyle = '#ff5fa2';
    for (const [t, n] of sc.kills ?? []) g.fillRect(t * colsPerSec, rows + 14, 2, 4 + n * 2);
    for (let s = 0; s < sc.seconds; s += 10) g.fillText(s + 's', s * colsPerSec + 2, rows + 10);
    const png = new Uint8Array(await (await cv.convertToBlob()).arrayBuffer());
    const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
    return { wav: b64(new Uint8Array(wav.buffer)), png: b64(png), peak: 20 * Math.log10(peak), clip, sections, renderMs };
  }, sc);
  fs.writeFileSync(new URL(name + '.wav', dir), Buffer.from(r.wav, 'base64'));
  fs.writeFileSync(new URL(name + '.png', dir), Buffer.from(r.png, 'base64'));
  console.log(`${name.padEnd(8)} ${sc.seconds}s  peak ${r.peak.toFixed(1)} dBFS  clipped samples ${r.clip}  audio ${(r.renderMs / 1000).toFixed(1)}s (${(sc.seconds * 1000 / r.renderMs).toFixed(1)}x realtime), ${((performance.now() - t0) / 1000).toFixed(1)}s total`);
  console.log('         ' + r.sections.map(([t, s]) => `${t}s ${s}`).join(' | '));
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
await browser.close();
close();
