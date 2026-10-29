// Bot playtest: node tools/playtest.mjs [--seeds 1,2,3] [--speed 2] [--start N] [--boons a,b] [--timeout 240] [--every 4] [--stall 40] [--stall-abort 150] [--out dir]
// Runs the real game headlessly with the autopilot, screenshots the moments that matter,
// and writes tools/out/playtest/<seed>/{report.json, index.html} plus a combined summary.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.mjs';
import { startServer } from './serve.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => { const [k, ...v] = s.trim().split(/\s+/); return [k, v.join(' ') || true]; }));
const seeds = String(args.seeds ?? '1').split(',').map(Number);
const speed = +(args.speed ?? 2), timeout = +(args.timeout ?? 300), every = +(args.every ?? 5);
const stallSec = +(args.stall ?? 40), stallAbort = +(args['stall-abort'] ?? 150);
const outRoot = args.out ?? 'tools/out/playtest';
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
  const q = new URLSearchParams({ seed, speed, bot: 1, ...(args.start != null ? { start: args.start } : {}), ...(args.god ? { god: 1 } : {}), ...(args.boons ? { boons: args.boons } : {}), ...(args.skill ? { botskill: args.skill } : {}) });
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
  // Health checks, all in game seconds: a run "stalls" when nothing moves the run forward
  // (no damage dealt, no kill, no room entered or cleared, no boon) for --stall seconds;
  // it is abandoned after --stall-abort. NaN positions and bugs inside walls are flagged.
  const problems = [], fullLog = [];
  let progress = null, progressT = 0, stalled = false, stalledOut = false;
  while (true) {
    await page.waitForTimeout(400);
    const st = await page.evaluate(probe, seen);
    const now = Date.now();
    fps.push((st.frames - lastFrames) / ((now - lastWall) / 1000)); lastFrames = st.frames; lastWall = now;
    seen = st.n;
    fullLog.push(...st.log);
    for (const e of st.log) {
      if (['enter', 'clear', 'death', 'win', 'boon'].includes(e.type)) await shot(`${e.type}-${e.id ?? e.name ?? ''}`);
    }
    if (st.t - lastShot >= every) { lastShot = st.t; await shot('t' + Math.round(st.t)); }
    for (const p of st.problems) if (!problems.some(q => q.kind === p.kind && q.what === p.what)) { problems.push(p); console.log(`  [${seed}] ${p.kind} at t=${p.t}: ${p.what}`); }
    if (st.progress !== progress) { progress = st.progress; progressT = st.t; stalled = false; }
    else if (!stalled && st.state === 'play' && st.t - progressT > stallSec) {
      stalled = true;
      problems.push({ kind: 'stall', t: +st.t.toFixed(1), what: `no progress for ${Math.round(st.t - progressT)}s`, ...st.where });
      console.log(`  [${seed}] STALL at t=${st.t.toFixed(0)}: ${JSON.stringify(st.where)}`);
      await shot('stall');
    }
    if (stalled && st.t - progressT > stallAbort) { stalledOut = true; await shot('stalled-out'); break; }
    if (st.state === 'dead' || st.state === 'win') { await page.waitForTimeout(2600); await shot('end'); break; }
    if ((now - t0) / 1000 > timeout) { await shot('timeout'); break; }
  }
  summary = await page.evaluate(() => window.__summary());
  summary.log = fullLog;
  summary.problems = problems;
  summary.stalled = stalledOut;
  summary.hurt = hurtReport(fullLog);
  summary.errors = errors;
  summary.wallSeconds = Math.round((Date.now() - t0) / 1000);
  summary.avgFps = +(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1);
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(dir, 'index.html'), sheet(seed, summary, shots));
  results.push(summary);
  await page.close();
  const { log, rooms, problems: probs, hurt, ...flat } = summary;
  console.log(`\n=== seed ${seed}: ${summary.won ? 'WON' : summary.dead ? 'DIED' : summary.stalled ? 'STALLED' : 'TIMEOUT'} at ${summary.time}s (wall ${summary.wallSeconds}s, ${summary.avgFps}fps)`);
  console.log(JSON.stringify(flat));
  console.log('rooms:', rooms.map(r => `${r.name}: ${r.dur ?? '-'}s hp ${Math.round(r.hpIn)}->${r.hpOut ?? '?'}`).join(' | '));
  console.log('hurt:', hurt.bySource.map(s => `${s.by} ${s.total} (${s.hits} hits, max ${s.max})`).join(', ') || 'none', `| worst 2s burst ${hurt.burst.amount} at t=${hurt.burst.t}`);
  console.log('problems:', probs.length ? probs.map(p => `${p.kind}@${p.t}: ${p.what}`).join(' | ') : 'none');
  if (errors.length) console.log('ERRORS:', errors.slice(0, 5).join('\n'));
}
const bad = results.filter(r => r.errors.length || r.problems.length);
console.log(`\nplaytest: ${results.length} runs, ${results.filter(r => r.won).length} won, ${results.filter(r => r.dead).length} died, ${results.filter(r => r.stalled).length} stalled, ${results.filter(r => !r.won && !r.dead && !r.stalled).length} timed out; ${bad.length} with problems or errors${bad.length ? ' (seeds ' + bad.map(r => r.seed).join(',') + ')' : ''}`);
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

// Runs in the page every poll: the log tail plus health checks on the live world.
function probe(n) {
  const g = window.__game, c = g.telemetry.c, t = g.telemetry.t, p = g.player;
  const qa = (window.__qa ??= { inWall: new Map() });
  const problems = [];
  const r1 = v => Math.round(v * 10) / 10;
  const name = e => e.type ?? (e.boss ? 'mantis' : e.kind ?? e.constructor.name);
  for (const e of g.world.entities) {
    if (e.dead) continue;
    if (![e.x, e.z, e.y, e.vx, e.vz].every(Number.isFinite)) problems.push({ kind: 'nan', t: r1(t), what: `${name(e)}#${e.nid} at ${e.x},${e.z} v ${e.vx},${e.vz}` });
    // A living bug whose centre sits in a solid tile for 2s is stuck in a wall.
    if (e.team === 'enemy' && e.hittable && !e.carried && g.map.solidAt(e.x, e.z)) {
      const since = qa.inWall.get(e) ?? t; qa.inWall.set(e, since);
      if (t - since > 2) problems.push({ kind: 'in-wall', t: r1(t), what: `${name(e)}#${e.nid} at ${r1(e.x)},${r1(e.z)}` });
    } else if ((e.constructor.name === 'Potion' || e.constructor.name === 'Gem') && g.map.solidAt(e.x, e.z)) {
      const since = qa.inWall.get(e) ?? t; qa.inWall.set(e, since);
      if (t - since > 2) problems.push({ kind: 'pickup-in-wall', t: r1(t), what: `${e.constructor.name}#${e.nid} at ${r1(e.x)},${r1(e.z)}` });
    } else qa.inWall.delete(e);
  }
  if (g.map.solidAt(p.x, p.z)) problems.push({ kind: 'player-in-wall', t: r1(t), what: `${r1(p.x)},${r1(p.z)}` });
  for (const r of g.level.rooms) {
    if (r.active) r.qaSince ??= t; else r.qaSince = null;
    if (r.active && t - r.qaSince > 240) problems.push({ kind: 'room-locked-long', t: r1(t), what: `${r.name}, ${r.enemies.filter(e => !e.dead).length} left` });
  }
  const cleared = g.level.rooms.filter(r => r.cleared).length;
  const progress = [Math.round(c.dealt), c.kills, cleared, g.currentRoom, g.telemetry.boons.length, c.breakables].join('|');
  const room = g.level.rooms[g.currentRoom];
  const foes = g.world.entities.filter(e => !e.dead && e.team === 'enemy' && e.hittable && e.active);
  const where = {
    player: [r1(p.x), r1(p.z)], hp: Math.round(p.hp), pstate: p.state, room: room?.name ?? `region ${g.currentRoom}`,
    active: g.level.rooms.filter(r => r.active).map(r => `${r.name}: ${r.enemies.filter(e => !e.dead).length} left, hatching ${r.hatching ?? 0}, waves ${r.waves.length}`),
    foes: foes.slice(0, 8).map(e => `${name(e)} ${r1(e.x)},${r1(e.z)} ${e.state ?? ''}${g.map.solidAt(e.x, e.z) ? ' IN-WALL' : ''}`),
    botTarget: g.bot?.target && !g.bot.target.dead ? `${name(g.bot.target)} ${r1(g.bot.target.x)},${r1(g.bot.target.z)}` : null,
    ignored: g.bot?.ignore ? [...g.bot.ignore].filter(([e, until]) => !e.dead && until > g.time).length : 0,
  };
  const total = g.telemetry.logged ?? 0, fresh = Math.min(g.telemetry.log.length, total - n);
  return { log: fresh > 0 ? g.telemetry.log.slice(-fresh) : [], n: total, t, state: g.state, frames: g.loop.frames, problems, progress, where };
}

// Who hurt the player, how hard, and the worst two seconds: the numbers behind "unfair".
function hurtReport(log) {
  const hurts = log.filter(e => e.type === 'hurt');
  const by = new Map();
  for (const h of hurts) { const s = by.get(h.by) ?? { by: h.by, total: 0, hits: 0, max: 0 }; s.total += h.amount; s.hits++; s.max = Math.max(s.max, h.amount); by.set(h.by, s); }
  let burst = { amount: 0, t: 0, from: [] };
  for (let i = 0; i < hurts.length; i++) {
    let sum = 0; const from = [];
    for (let j = i; j < hurts.length && hurts[j].t - hurts[i].t <= 2; j++) { sum += hurts[j].amount; from.push(`${hurts[j].by} ${hurts[j].amount}`); }
    if (sum > burst.amount) burst = { amount: sum, t: hurts[i].t, from };
  }
  return { bySource: [...by.values()].sort((a, b) => b.total - a.total), burst };
}
