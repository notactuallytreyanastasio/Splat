// Bot playtest: node tools/playtest.mjs [--seeds 1,2,3] [--speed 2] [--room N] [--timeout 240] [--every 4]
// Runs the real game headlessly with the autopilot, screenshots the moments that matter,
// and writes tools/out/playtest/<seed>/{report.json, index.html} plus a combined summary.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.mjs';
import { startServer } from './serve.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => { const [k, ...v] = s.trim().split(/\s+/); return [k, v.join(' ') || true]; }));
const seeds = String(args.seeds ?? '1').split(',').map(Number);
const speed = +(args.speed ?? 2), timeout = +(args.timeout ?? 300), every = +(args.every ?? 5);
const outRoot = 'tools/out/playtest';
fs.mkdirSync(outRoot, { recursive: true });

const { url, close } = await startServer();
const browser = await launch();
const results = [];
for (const seed of seeds) {
  const dir = path.join(outRoot, String(seed));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message + '\n' + (e.stack ?? '')));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const q = new URLSearchParams({ seed, speed, bot: 1, ...(args.room != null ? { room: args.room } : {}), ...(args.god ? { god: 1 } : {}), ...(args.skill ? { botskill: args.skill } : {}) });
  await page.goto(`${url}/?${q}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  const shots = [];
  const shot = async label => {
    const name = `${String(shots.length).padStart(3, '0')}-${label.replace(/\W+/g, '_')}.png`;
    await page.screenshot({ path: path.join(dir, name) });
    const s = await page.evaluate(() => { const g = window.__game; return { t: g.telemetry.t, hp: Math.round(g.player.hp), kills: g.telemetry.c.kills }; });
    shots.push({ name, label, ...s });
  };
  const t0 = Date.now();
  let seen = 0, lastShot = 0, summary, fps = [];
  let lastFrames = await page.evaluate(() => window.__game.loop.frames), lastWall = Date.now();
  while (true) {
    await page.waitForTimeout(400);
    const st = await page.evaluate(n => ({ log: window.__game.telemetry.log.slice(n), n: window.__game.telemetry.log.length, t: window.__game.telemetry.t, state: window.__game.state, frames: window.__game.loop.frames }), seen);
    const now = Date.now();
    fps.push((st.frames - lastFrames) / ((now - lastWall) / 1000)); lastFrames = st.frames; lastWall = now;
    seen = st.n;
    for (const e of st.log) {
      if (['enter', 'clear', 'death', 'win', 'boon'].includes(e.type)) await shot(`${e.type}-${e.id ?? e.name ?? ''}`);
    }
    if (st.t - lastShot >= every) { lastShot = st.t; await shot('t' + Math.round(st.t)); }
    if (st.state === 'dead' || st.state === 'win') { await page.waitForTimeout(2600); await shot('end'); break; }
    if ((now - t0) / 1000 > timeout) { await shot('timeout'); break; }
  }
  summary = await page.evaluate(() => window.__summary());
  summary.log = await page.evaluate(() => window.__game.telemetry.log);
  summary.errors = errors;
  summary.wallSeconds = Math.round((Date.now() - t0) / 1000);
  summary.avgFps = +(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1);
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(dir, 'index.html'), sheet(seed, summary, shots));
  results.push(summary);
  await page.close();
  const { log, rooms, ...flat } = summary;
  console.log(`\n=== seed ${seed}: ${summary.won ? 'WON' : summary.dead ? 'DIED' : 'TIMEOUT'} at ${summary.time}s (wall ${summary.wallSeconds}s, ${summary.avgFps}fps)`);
  console.log(JSON.stringify(flat));
  console.log('rooms:', rooms.map(r => `${r.name}: ${r.dur ?? '-'}s hp ${Math.round(r.hpIn)}->${r.hpOut ?? '?'}`).join(' | '));
  if (errors.length) console.log('ERRORS:', errors.slice(0, 5).join('\n'));
}
fs.writeFileSync(path.join(outRoot, 'summary.json'), JSON.stringify(results.map(({ log, ...r }) => r), null, 2));
await browser.close();
close();

function sheet(seed, s, shots) {
  return `<!doctype html><meta charset=utf-8><title>playtest ${seed}</title>
<style>body{font:14px system-ui;background:#ffe9f6;color:#3a2346;margin:20px}img{width:100%;border:3px solid #3a2346;border-radius:8px}
.g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0}figcaption{font-weight:600}pre{background:#fff;padding:10px;border-radius:8px;overflow:auto}</style>
<h1>Seed ${seed}: ${s.won ? 'won' : s.dead ? 'died' : 'timeout'} in ${s.time}s</h1>
<pre>${JSON.stringify({ ...s, log: undefined }, null, 1)}</pre>
<div class=g>${shots.map(x => `<figure><img src="${x.name}"><figcaption>${x.label} · t=${x.t.toFixed(1)}s · hp ${x.hp} · kills ${x.kills}</figcaption></figure>`).join('')}</div>`;
}
