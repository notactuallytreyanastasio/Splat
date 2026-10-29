// DOM HUD: Diablo-style health and rage orbs, XP strip, streak counter, banners, boss bar,
// boon picker and end screen.
import { gradeRun, recordBests } from './grade.js';
import { boonById } from './boons.js';
export class Hud {
  constructor(game) {
    this.g = game;
    const root = document.getElementById('hud');
    root.innerHTML = `
      <div class="orb hp"><div class="fill"></div><span></span></div>
      <div class="orb rage"><div class="fill"></div><span></span></div>
      <div class="xp"><div class="fill"></div><b class="lvl"></b></div>
      <div class="potions"></div>
      <div class="gems"></div>
      <div class="streak"><b></b><i></i></div>
      <div class="banner"><h1></h1><h2></h2></div>
      <div class="boss"><label>EMPRESS MANTIS</label><div class="bar"><div class="fill"></div></div></div>
      <div class="boons"><h1>LEVEL UP!</h1><div class="cards"></div><p>press 1 / 2 / 3</p></div>
      <div class="end"></div>
      <div class="vignette"></div>
      <div class="title"><h1>PASTEL GARDEN<br>MASSACRE</h1><h2>a very pretty place to make a mess</h2>
        <div class="keys"><b>WASD</b> move <b>mouse</b> aim <b>LMB</b> slash combo <b>RMB</b> batter-up <b>E</b> grab &amp; throw <b>SPACE</b> roll <b>Q</b> rainbow blender <b>R</b> potion <b>SHIFT</b> parry <b>TAB</b> lock <b>M</b> sound</div>
        <p class="tip">anything you hit hard enough becomes a projectile. so do the bodies.</p>
        <button>click to start squishing</button>
        <div class="modes"><button class="coop" type="button">host co-op</button><form class="join"><input name="code" placeholder="room code" maxlength="12"><button type="submit">join</button></form></div>
        <small>gamepad works too · up to 4 knights in co-op</small></div>
      <button class="audio" type="button" aria-label="sound">♪</button>
      <div class="cue"><i></i><b>!</b></div>
      <div class="roster"></div>
      <div class="tags"></div>
      <div class="help">WASD move · mouse aim · LMB slash · RMB batter-up · E grab/throw · SPACE dodge · Q blender · R potion</div>`;
    this.$ = s => root.querySelector(s);
    this.tags = new Map();
    this.$('.audio').onclick = e => { e.stopPropagation(); this.g.cycleAudio(); };
    this.audioIcon(game.audioMode);
    this.bannerT = 0;
  }
  update(dt) {
    const g = this.g, p = g.player, st = p.stats;
    this.$('.hp .fill').style.height = Math.max(0, (p.hp / st.maxHp) * 100) + '%';
    this.$('.hp span').textContent = Math.max(0, Math.ceil(p.hp));
    this.$('.rage .fill').style.height = p.rage + '%';
    this.$('.rage').classList.toggle('full', p.rage >= 100);
    this.$('.rage span').textContent = p.rage >= 100 ? 'Q!' : Math.floor(p.rage);
    this.$('.xp .fill').style.width = (g.xp / g.xpNeed()) * 100 + '%';
    this.$('.xp .lvl').textContent = 'LV ' + g.level_;
    this.$('.potions').textContent = '♥'.repeat(p.potions) || '·';
    this.$('.gems').textContent = '◆ ' + g.gems;
    const boss = g.boss;
    this.$('.boss').classList.toggle('on', !!boss && !boss.dead);
    if (boss) this.$('.boss .fill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
    this.bannerT -= dt;
    this.$('.banner').classList.toggle('on', this.bannerT > 0);
    const v = this.$('.vignette');
    v.style.opacity = Math.max(0, parseFloat(v.style.opacity || 0) - dt * 2.5) + (p.hp < st.maxHp * 0.3 ? 0.25 + Math.sin(g.time * 6) * 0.1 : 0) * 0;
    this.$('.vignette').classList.toggle('low', p.hp < st.maxHp * 0.3);
    if (g.coop) this.updateCoop();
    // Parry cue: a ring closes on your knight; tap as it lands.
    const cue = this.$('.cue'), t = g.threat ?? Infinity, on = t < 0.45 && !p.ghost && g.state === 'play';
    cue.classList.toggle('on', on);
    if (on) {
      const s = g.view.worldToScreen(p.x, 1.0, p.z);
      cue.style.transform = `translate(${s.x}px, ${s.y}px)`;
      cue.style.setProperty('--k', (0.4 + t / 0.45 * 2.2).toFixed(3));
      cue.classList.toggle('now', t < 0.2);
    }
  }
  perf(view) {
    const i = view.renderer.info.render;
    (this.perfEl ??= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'perf' })).textContent = `${(1000 / view.frameMs).toFixed(0)} fps · ${i.calls} calls · ${(i.triangles / 1000).toFixed(0)}k tris · x${view.ratio.toFixed(2)}`;
  }
  audioIcon(mode) { const b = this.$('.audio'); b.textContent = { all: '♪', sfx: '🔈', off: '🔇' }[mode] ?? '♪'; b.classList.toggle('muted', mode !== 'all'); }
  roster() { this.rosterDirty = true; }
  updateCoop() {
    const g = this.g, list = [g.player, ...g.coop.remotes.values()];
    const hex = c => '#' + (c ?? 0xff5fa2).toString(16).padStart(6, '0');
    this.$('.roster').innerHTML = `<b>room ${g.net.room}</b>` + list.map(k => `<div style="--c:${hex(k.tint?.ring)}"><i></i>${k === g.player ? 'you' : (k.name ?? '?')}${k.ghost ? ' 👻' : ''}<span><em style="width:${Math.max(0, k.hp / k.stats.maxHp * 100)}%"></em></span></div>`).join('');
    // Name tags float over the other knights.
    const box = this.$('.tags');
    for (const [id, rp] of g.coop.remotes) {
      let el = this.tags.get(id);
      if (!el) { el = document.createElement('div'); el.className = 'tag'; box.appendChild(el); this.tags.set(id, el); }
      el.textContent = rp.name ?? '?';
      el.style.color = hex(rp.tint?.ring);
      const s = g.view.worldToScreen(rp.x, 2.2, rp.z);
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
      el.style.display = rp.ghost ? 'none' : '';
    }
    for (const [id, el] of this.tags) if (!g.coop.remotes.has(id)) { el.remove(); this.tags.delete(id); }
  }
  banner(title, sub = '', dur = 2.2) {
    this.$('.banner h1').textContent = title;
    this.$('.banner h2').textContent = sub;
    this.bannerT = dur;
    const b = this.$('.banner'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  }
  streak(n, title) {
    const s = this.$('.streak');
    s.classList.toggle('on', n > 1);
    if (n > 1) {
      this.$('.streak b').textContent = n + ' KILLS';
      if (title) this.$('.streak i').textContent = title;
      s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
    } else this.$('.streak i').textContent = '';
  }
  title(onStart, net) {
    const t = this.$('.title');
    t.classList.add('on');
    if (net) {
      const link = `${location.origin}${location.pathname.replace(/index\.html$/, '')}?coop=${net.room}`;
      t.querySelector('.modes').innerHTML = `<p class="room">co-op room <b>${net.room}</b> · you are <b>${net.name}</b> · ${net.isHost ? 'you host' : 'joined'}</p><p class="share">send this: <button class="copy" type="button"><code>${link}</code><span>tap to copy</span></button></p>`;
      const copy = t.querySelector('.copy');
      copy.onclick = async e => {
        e.stopPropagation();
        let ok = false;
        try { if (navigator.share && this.g.view.coarse) { await navigator.share({ title: 'Pastel Garden Massacre', text: 'come squish bugs with me', url: link }); ok = true; } } catch {}
        if (!ok) try { await navigator.clipboard.writeText(link); ok = true; } catch {}
        if (!ok) { const r = document.createRange(); r.selectNodeContents(copy.querySelector('code')); getSelection().removeAllRanges(); getSelection().addRange(r); ok = document.execCommand?.('copy'); }
        copy.querySelector('span').textContent = ok ? 'copied!' : 'long-press to copy';
        setTimeout(() => { copy.querySelector('span').textContent = 'tap to copy'; }, 1800);
      };
      t.querySelector('button').textContent = net.isHost ? 'start the massacre' : 'jump in';
    } else {
      // Co-op stays hidden until its server channel is live (?beta shows it).
      t.querySelector('.coop').onclick = () => { const code = Math.random().toString(36).slice(2, 6).toUpperCase(); location.search = '?coop=' + code; };
      t.querySelector('.join').onsubmit = e => { e.preventDefault(); const c = e.target.code.value.trim().toUpperCase(); if (c) location.search = '?coop=' + encodeURIComponent(c); };
    }
    const go = () => { t.classList.remove('on'); removeEventListener('keydown', key); onStart(); document.documentElement.requestFullscreen?.().catch(() => {}); };
    const key = e => { if (e.code === 'Enter' || e.code === 'Space') go(); };
    t.querySelector('button').onclick = go;
    addEventListener('keydown', key);
  }
  parried() { const c = this.$('.cue'); c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit'); }
  hurt() { const v = this.$('.vignette'); v.style.opacity = 0.8; }
  showBoons(offers, live = false) {
    const el = this.$('.boons');
    el.classList.toggle('live', live);
    el.querySelector('.cards').innerHTML = offers.map((b, i) => `<button data-i="${i}"><em>${i + 1}</em><span class="icon">${b.icon}</span><b>${b.name}</b><small>${b.desc}</small></button>`).join('');
    el.querySelectorAll('button').forEach(btn => btn.onclick = () => this.g.chooseBoon(+btn.dataset.i));
    el.classList.add('on');
  }
  hideBoons() { this.$('.boons').classList.remove('on'); }
  showEnd(won) {
    const g = this.g, t = g.telemetry.summary();
    if (g.guest && g.squad?.k != null) { t.kills = g.squad.k; t.maxChain = Math.max(t.maxChain, g.squad.ch ?? 0); }
    const { grade, score, parts } = gradeRun(t, won);
    // Bot, god-mode and skip-ahead runs are graded but never set records.
    const { old, next, broke } = recordBests(t, won, grade, !g.bot && !g.god && g.opts.start == null && !g.opts.boons);
    const mmss = s => s == null ? '--' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const stamp = k => broke[k] ? '<i class="nb">NEW BEST</i>' : '';
    const metric = (ic, label, val, part, k, i) => `<div class="m" style="--d:${0.25 + i * 0.12}s"><span class="mi">${METRIC_ICONS[ic]}</span><span class="ml">${label}</span><b>${val}</b><em><u style="width:${Math.round(part * 100)}%"></u></em>${stamp(k)}</div>`;
    const counts = new Map();
    for (const id of g.player.boons ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    const cards = [...counts].map(([id, n], i) => { const b = boonById(id); return b ? `<div class="bc" style="--d:${0.9 + i * 0.06}s" title="${b.desc}">${b.icon}<span>${b.name}</span>${n > 1 ? `<em>x${n}</em>` : ''}</div>` : ''; }).join('');
    const el = this.$('.end');
    el.innerHTML = `<div class="sheet">
      <h1>${won ? 'EVERYTHING IS DEAD' : 'ADORABLY MURDERED'}</h1>
      <h2>${won ? 'the garden is spotless. well, no.' : `popped in ${g.level.rooms[g.currentRoom]?.name ?? 'the garden'}`}</h2>
      <div class="top">
        <div class="grade g${grade}">${ROSETTE}<b>${grade}</b><small>${score} pts</small>${stamp('grade')}</div>
        <div class="metrics">
          ${metric('clock', won ? 'time' : 'survived', mmss(t.time), parts.time, 'time', 0)}
          ${metric('heart', 'damage taken', Math.round(t.taken), parts.taken, null, 1)}
          ${metric('pinball', 'best pinball', 'x' + t.maxChain, parts.chain, 'chain', 2)}
          ${metric('skull', 'bugs squished', t.kills, parts.kills, null, 3)}
        </div>
      </div>
      <div class="bests"><span class="bl">personal bests</span><span>time <b>${mmss(next.time)}</b></span><span>grade <b>${next.grade ?? '--'}</b></span><span>chain <b>x${next.chain ?? 0}</b></span>${old.grade == null ? '<span class="first">first run on record</span>' : ''}</div>
      <div class="extras"><span><b>${t.gibs}</b> pieces</span><span><b>${t.droplets}</b> drops of blood</span><span><b>${t.wallSlams}</b> wall splats</span><span><b>${t.bestStreak}</b> best streak</span><span><b>LV ${g.level_}</b></span></div>
      ${cards ? `<div class="build"><span class="bl">your build</span><div class="cards">${cards}</div></div>` : '<div class="build"><span class="bl">no boons taken. brave.</span></div>'}
      <p>${g.guest ? 'waiting for the host…' : `<button class="again" type="button">${won ? 'another lap' : 'new run'}</button><small class="hint">or press ENTER</small>`}</p>
    </div>`;
    el.classList.toggle('won', won);
    el.classList.add('on');
    // Off the battlefield: dropping 'playing' hides the touch pad (it sat on top of the
    // button) and lifts touch-action:none, so a short phone can scroll the card.
    document.body.classList.remove('playing');
    if (Object.values(broke).some(Boolean)) g.sfx.play('levelup');
    const again = el.querySelector('.again');
    if (again) again.onclick = () => { this.g.againTapped = true; };
  }
}

// Little drawn glyphs for the end screen, same ink and pastel as the boon icons.
const svg = b => `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="#3a2346" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
const METRIC_ICONS = {
  clock: svg('<circle cx="16" cy="17" r="12" fill="#a6dcff"/><path d="M16 10 L16 17 L21 20"/><path d="M12 3 L20 3"/>'),
  heart: svg('<path d="M16 28 Q3 19 4 11 Q6 4 12 5 Q15 6 16 9 Q17 6 20 5 Q26 4 28 11 Q29 19 16 28 Z" fill="#ff9ecb"/><path d="M16 9 L13 15 L18 18 L15 24" stroke-width="2.5"/>'),
  pinball: svg('<circle cx="11" cy="21" r="8" fill="#fff1a1"/><path d="M17 15 L28 4 M22 18 L29 14 M14 11 L17 3" stroke-width="2.5"/><ellipse cx="9" cy="18" rx="2.5" ry="1.5" fill="#fff" stroke="none"/>'),
  skull: svg('<path d="M6 15 Q6 4 16 4 Q26 4 26 15 Q26 20 22 22 L22 27 L10 27 L10 22 Q6 20 6 15 Z" fill="#fffbff"/><circle cx="12" cy="15" r="3" fill="#ff5fa2"/><circle cx="20" cy="15" r="3" fill="#ff5fa2"/><path d="M14 27 L14 23 M18 27 L18 23" stroke-width="2.5"/>'),
};
// A scalloped prize rosette with two ribbon tails.
const ROSETTE = (() => {
  const n = 14, pts = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const p = (a, r) => `${(60 + Math.sin(a) * r).toFixed(1)} ${(56 - Math.cos(a) * r).toFixed(1)}`;
    pts.push(`${i ? '' : 'M' + p(a0, 44)} Q${p(a1, 54)} ${p(a2, 44)}`);
  }
  return `<svg class="ros" viewBox="0 0 120 140" aria-hidden="true" stroke="#3a2346" stroke-width="5" stroke-linejoin="round">
    <path d="M38 88 L24 136 L40 126 L50 138 L58 96 Z" fill="var(--rb)"/><path d="M82 88 L96 136 L80 126 L70 138 L62 96 Z" fill="var(--rb)"/>
    <path d="${pts.join(' ')} Z" fill="var(--ra)"/><circle cx="60" cy="56" r="34" fill="#fffbff"/><circle cx="60" cy="56" r="27" fill="none" stroke="var(--ra)" stroke-width="4" stroke-dasharray="2 7"/></svg>`;
})();
