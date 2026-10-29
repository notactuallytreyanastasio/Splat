// DOM HUD: Diablo-style health and rage orbs, XP strip, streak counter, banners, boss bar,
// boon picker and end screen.
import { icon } from './icons.js';

import { ICONS } from './tutorial.js';

// Icons are drawn here, never emoji: ink outline, pastel fill, like everything else.
const SPARK = `<svg class="spark" viewBox="-14 -14 28 28"><path d="M0-12C1.4-3 3-1.4 12 0C3 1.4 1.4 3 0 12C-1.4 3-3 1.4-12 0C-3-1.4-1.4-3 0-12Z" fill="#fff9c9" stroke="#3a2346" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
const BURST = (() => {
  const pts = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 52 : 92 - (i % 4) * 8; pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`); }
  return `<svg class="burst" viewBox="-100 -100 200 200"><polygon points="${pts.join(' ')}" fill="#fff1a1" stroke="#3a2346" stroke-width="7" stroke-linejoin="round"/><circle r="30" fill="#ff9ecb" stroke="#3a2346" stroke-width="6"/></svg>`;
})();

// Hand-drawn in the house style: fat ink outline, pastel fills. No emoji anywhere.
const INK = '#3a2346';
const CROWN = `<path d="M30 66 L22 28 L44 46 L60 18 L76 46 L98 28 L90 66 Z" fill="#ffd66b" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <rect x="27" y="58" width="66" height="13" rx="5" fill="#ffc94d" stroke="${INK}" stroke-width="5"/>
  <circle cx="22" cy="28" r="5.5" fill="#fff1a1" stroke="${INK}" stroke-width="4"/><circle cx="60" cy="18" r="5.5" fill="#fff1a1" stroke="${INK}" stroke-width="4"/><circle cx="98" cy="28" r="5.5" fill="#fff1a1" stroke="${INK}" stroke-width="4"/>
  <path d="M60 58 C50 51 47 43 53 40 C56.5 38.5 60 41 60 44 C60 41 63.5 38.5 67 40 C73 43 70 51 60 58 Z" fill="#ff5fa2" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M38 36 L40 44" stroke="#fffbff" stroke-width="3" stroke-linecap="round"/>`;
const SCYTHE = `<path d="M40 60 L22 52" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M40 60 L22 52" stroke="#9ff0d4" stroke-width="4" stroke-linecap="round"/>
  <path d="M24 54 Q-2 46 4 8 Q12 34 30 44 Z" fill="#ff9ecb" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
  <path d="M9 22 L15 24 M8 31 L15 31 M11 39 L17 37" stroke="#fffbff" stroke-width="3" stroke-linecap="round"/>`;
const EMBLEM = `<svg viewBox="0 0 120 80" aria-hidden="true">${SCYTHE}<g transform="translate(120 0) scale(-1 1)">${SCYTHE}</g>${CROWN}</svg>`;
const MINI_CROWN = `<svg viewBox="16 12 88 64" aria-hidden="true">${CROWN}</svg>`;
import { gradeRun, recordBests } from './grade.js';
import { boonById } from './boons.js';
export class Hud {
  constructor(game) {
    this.g = game;
    const root = document.getElementById('hud');
    root.innerHTML = `
      <div class="orb hp"><div class="lag"></div><div class="fill"></div><span></span></div>
      <div class="orb rage"><div class="fill"></div>${SPARK.repeat(5)}<span></span></div>
      <div class="xp"><div class="fill"></div><b class="lvl"></b></div>
      <div class="potions"></div>
      <div class="gems">${icon('gem')}<span></span></div>
      <div class="lapchip"></div>
      <div class="streak">${BURST}<b></b><i></i></div>
      <div class="banner"><h1></h1><h2></h2></div>
      <div class="boss"><label>EMPRESS MANTIS</label><div class="bar"><div class="fill"></div></div></div>
      <div class="boons"><h1>LEVEL UP!</h1><div class="cards"></div><p>press 1 / 2 / 3</p></div>
      <div class="end"></div>
      <div class="vignette"></div><div class="lowhp"></div><div class="edge"></div>
      <div class="title"><h1>PASTEL GARDEN<br>MASSACRE</h1><h2>a very pretty place to make a mess</h2>
        <div class="keys"><b>WASD</b> move <b>mouse</b> aim <b>LMB</b> slash combo <b>RMB</b> batter-up <b>E</b> grab &amp; throw <b>SPACE</b> roll <b>Q</b> rainbow blender <b>R</b> potion <b>SHIFT</b> parry <b>TAB</b> lock <b>M</b> sound</div>
        <p class="tip">anything you hit hard enough becomes a projectile. so do the bodies.</p>
        <button>click to start squishing</button>
        <div class="modes"><button class="howto" type="button">${ICONS.howto}how to play</button><button class="coop" type="button">host co-op</button><form class="join"><input name="code" placeholder="room code" maxlength="12"><button type="submit">join</button></form></div>
        <small>gamepad works too · up to 4 knights in co-op</small></div>
      <button class="audio" type="button" aria-label="sound"></button>
      <div class="cue"><i></i><b>!</b></div>
      <div class="roster"></div>
      <div class="tags"></div>
      <div class="help">WASD move · mouse aim · LMB slash · RMB batter-up · E grab/throw · SPACE dodge · Q blender · R potion</div>`;
    this.$ = s => root.querySelector(s);
    this.tags = new Map();
    this.$('.audio').onclick = e => { e.stopPropagation(); this.g.cycleAudio(); };
    this.audioIcon(game.audioMode);
    // Lap 1 is just the game; from lap 2 the HUD always says how deep you are.
    if (game.lap > 1) { const c = this.$('.lapchip'); c.innerHTML = `${icon('lap')}<b>LAP ${game.lap}</b>`; c.classList.add('on'); c.title = game.theme.name.toLowerCase(); }
    this.bannerT = 0;
    this.lagHp = game.player.hp; this.lagHold = 0; this.beatT = 0; this.rageFull = false;
  }
  update(dt) {
    const g = this.g, p = g.player, st = p.stats;
    this.$('.hp .fill').style.height = Math.max(0, (p.hp / st.maxHp) * 100) + '%';
    this.$('.hp span').textContent = Math.max(0, Math.ceil(p.hp));
    // Lost health lingers as a lemon chunk for a beat, then drains: you can read how big a hit was.
    const rdt = dt / (g.loop.speed || 1);
    if (p.hp >= this.lagHp) this.lagHp = p.hp;
    else if ((this.lagHold -= rdt) <= 0) this.lagHp = Math.max(p.hp, this.lagHp - st.maxHp * rdt * 0.6);
    this.$('.hp .lag').style.height = Math.max(0, (this.lagHp / st.maxHp) * 100) + '%';
    this.$('.rage .fill').style.height = p.rage + '%';
    const full = p.rage >= 100;
    this.$('.rage').classList.toggle('full', full);
    if (full && !this.rageFull) { this.restart('.rage', 'ding'); g.sfx.play('ragefull'); }
    this.rageFull = full;
    this.$('.rage span').textContent = p.rage >= 100 ? 'Q!' : Math.floor(p.rage);
    this.$('.xp .fill').style.width = (g.xp / g.xpNeed()) * 100 + '%';
    this.$('.xp .lvl').textContent = 'LV ' + g.level_;
    // innerHTML only on change: these run every frame and the hearts are SVG.
    if (this.shownPotions !== p.potions) { this.shownPotions = p.potions; this.$('.potions').innerHTML = p.potions ? icon('heart').repeat(p.potions) : `<span class="none">${icon('heart')}</span>`; }
    if (this.shownGems !== g.gems) { this.shownGems = g.gems; this.$('.gems span').textContent = g.gems; }
    const boss = g.boss;
    this.$('.boss').classList.toggle('on', !!boss && !boss.dead);
    if (boss) {
      this.$('.boss .fill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
      this.bossBar(boss);
    }
    if (this.cineT > 0 && (this.cineT -= dt) <= 0) this.$('.cine')?.classList.remove('on');
    if (this.cardT > 0 && (this.cardT -= dt) <= 0) { const c = this.$('.bosscard'); c.classList.remove('on'); c.classList.add('off'); }
    this.bannerT -= dt;
    this.$('.banner').classList.toggle('on', this.bannerT > 0);
    const v = this.$('.vignette');
    v.style.opacity = Math.max(0, parseFloat(v.style.opacity || 0) - dt * 2.5);
    // Low health: a heartbeat, quicker the closer you are to popping, and a soft pink
    // pulse at the screen edge on each beat.
    const frac = p.hp / st.maxHp, low = frac < 0.3 && p.hp > 0 && !p.ghost && g.state === 'play' && g.started;
    this.$('.lowhp').classList.toggle('on', low);
    if (low && (this.beatT -= rdt) <= 0) {
      this.beatT = 0.6 + frac * 1.6;
      g.sfx.play('heartbeat', { vol: 1.3 - frac * 2, gap: 0.3 });
      this.restart('.lowhp', 'beat');
    } else if (!low) this.beatT = 0;
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
  audioIcon(mode) { const b = this.$('.audio'); b.innerHTML = icon({ all: 'note', sfx: 'speaker', off: 'mute' }[mode] ?? 'note'); b.classList.toggle('muted', mode !== 'all'); }
  roster() { this.rosterDirty = true; }
  updateCoop() {
    const g = this.g, list = [g.player, ...g.coop.remotes.values()];
    const hex = c => '#' + (c ?? 0xff5fa2).toString(16).padStart(6, '0');
    const html = `<b>room ${g.net.room}</b>` + list.map(k => `<div class="${k.ghost ? 'ghost' : ''}" style="--c:${hex(k.tint?.ring)}"><i></i>${k === g.player ? 'you' : (k.name ?? '?')}${k.ghost ? icon('ghost') : ''}<span><em style="width:${Math.max(0, k.hp / k.stats.maxHp * 100).toFixed(0)}%"></em></span></div>`).join('');
    if (html !== this.rosterHtml) { this.rosterHtml = html; this.$('.roster').innerHTML = html; }
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
      // The big milestones (5, 7, 10, 15) get a starburst and a much bigger slam. 2 to 4 are
      // named too, but they land on nearly every multi-kill, and a slam every kill is noise.
      s.classList.remove('pop', 'mile'); void s.offsetWidth; s.classList.add(title && n >= 5 ? 'mile' : 'pop');
    } else this.$('.streak i').textContent = '';
  }
  title(onStart, net) {
    const t = this.$('.title');
    t.classList.add('on');
    if (this.g.lap > 1) this.lapTitle(t, net);
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
      t.querySelector('button').textContent = net.isHost ? (this.g.lap > 1 ? `start lap ${this.g.lap}` : 'start the massacre') : 'jump in';
    } else if (this.g.lap > 1) {
      t.querySelector('.fresh').onclick = e => { e.stopPropagation(); this.g.restart(true); };
    } else {
      // Co-op stays hidden until its server channel is live (?beta shows it).
      t.querySelector('.howto').onclick = e => { e.stopPropagation(); location.search = '?tutorial'; };
      t.querySelector('.coop').onclick = () => { const code = Math.random().toString(36).slice(2, 6).toUpperCase(); location.search = '?coop=' + code; };
      t.querySelector('.join').onsubmit = e => { e.preventDefault(); const c = e.target.code.value.trim().toUpperCase(); if (c) location.search = '?coop=' + encodeURIComponent(c); };
    }
    const go = () => { t.classList.remove('on'); removeEventListener('keydown', key); onStart(); document.documentElement.requestFullscreen?.().catch(() => {}); };
    const key = e => { if (e.code === 'Enter' || e.code === 'Space') go(); };
    t.querySelector('button').onclick = go;
    addEventListener('keydown', key);
  }
  // The title screen between laps: the reload needs a click for audio anyway, so it doubles
  // as the "you made it" card. It names the lap and its hour and lists what you carry.
  lapTitle(t, net) {
    const g = this.g, p = g.player, th = g.theme, nb = p.boons?.length ?? 0;
    t.classList.add('lap');
    t.querySelector('h1').innerHTML = `<span class="lapno">${icon('lap')}LAP ${g.lap}</span><br>${th.name}`;
    t.querySelector('h2').textContent = th.sub;
    t.querySelector('.tip').innerHTML = g.lapEarned
      ? `you carry <b>LV ${g.level_}</b>, <b>${nb}</b> boon${nb === 1 ? '' : 's'} and <b>${p.potions}</b> potion${p.potions === 1 ? '' : 's'}. the bugs carry grudges: more of them, tougher, faster.`
      : 'the bugs are tougher, faster and there are more of them.';
    t.querySelector('button').textContent = `start lap ${g.lap}`;
    if (!net) t.querySelector('.modes').innerHTML = '<button class="fresh" type="button">start a fresh run instead</button>';
  }
  // Lap banner at the start of a lap: the number big, the hour on a ribbon.
  lapCard(n, th) {
    let c = this.$('.lapcard');
    if (!c) { c = document.createElement('div'); c.className = 'lapcard'; document.getElementById('hud').append(c); }
    c.innerHTML = `<div class="no">${icon('lap')}<b>LAP ${n}</b></div><div class="ribbon"><h1>${th.name}</h1></div><h2>${th.sub}</h2>`;
    c.classList.remove('off', 'on'); void c.offsetWidth; c.classList.add('on');
    clearTimeout(this.lapOut);
    this.lapOut = setTimeout(() => { c.classList.remove('on'); c.classList.add('off'); }, 3200);
    this.bannerT = 0;
  }
  restart(sel, cls) { const el = this.$(sel); el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  crit() { this.restart('.edge', 'on'); }
  // ------------------------------------------------------------ the Empress
  // Built on first use so the shared template above stays untouched.
  bossUi() {
    if (this._bossUi) return;
    this._bossUi = true;
    const root = document.getElementById('hud');
    const add = (cls, html = '') => { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; return el; };
    root.prepend(add('cine'));
    root.append(add('flash'), add('bosscard', `${EMBLEM}<div class="ribbon"><h1></h1></div><h2></h2>`));
    const bar = this.$('.boss .bar'), label = this.$('.boss label');
    bar.insertAdjacentHTML('beforeend', '<i class="notch"></i>');
    label.innerHTML = `${MINI_CROWN}<span>${label.textContent}</span>${MINI_CROWN}`;
  }
  bossBar(boss) { this.bossUi(); this.$('.boss').classList.toggle('p2', !!boss.phase2); }
  bossCard(title, sub, dur = 2) {
    this.bossUi();
    const c = this.$('.bosscard');
    c.querySelector('h1').textContent = title;
    c.querySelector('h2').textContent = sub;
    c.classList.remove('off', 'on'); void c.offsetWidth; c.classList.add('on');
    this.cardT = dur;
    this.bannerT = 0; // the card is the only words on screen
  }
  // Letterbox bars for a cinematic beat; they leave on their own.
  cinema(dur) { this.bossUi(); this.$('.cine').classList.add('on'); this.cineT = Math.max(this.cineT ?? 0, dur); }
  flash(color) {
    this.bossUi();
    const f = this.$('.flash');
    f.style.background = color;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  // The burst plays once, then the cue goes back to hidden: left on, its "!" badge stayed
  // on screen for the rest of the run wherever the last parry happened.
  parried() {
    const c = this.$('.cue'); c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit');
    clearTimeout(this.cueT); this.cueT = setTimeout(() => c.classList.remove('hit'), 400);
  }
  hurt() { const v = this.$('.vignette'); v.style.opacity = 0.8; this.lagHold = 0.45; this.restart('.orb.hp', 'hit'); }
  showBoons(offers, live = false) {
    const el = this.$('.boons');
    clearTimeout(this.boonOut);
    el.classList.remove('on', 'out');
    el.classList.toggle('live', live);
    // Numbers in the description are the part you compare, so they get the ink treatment.
    const desc = d => d.replace(/[+-]?\d+(\.\d+)?%?/g, '<i>$&</i>');
    el.querySelector('.cards').innerHTML = offers.map((b, i) => `<button class="card" type="button" data-i="${i}" style="--i:${i}"><em class="key">${i + 1}</em><span class="medal">${icon(b.icon)}</span><b>${b.name}</b><small>${desc(b.desc)}</small></button>`).join('');
    el.querySelectorAll('.card').forEach(btn => btn.onclick = () => this.g.chooseBoon(+btn.dataset.i));
    el.querySelector('p').textContent = this.g.touch?.active ? 'tap a card' : 'press 1 / 2 / 3 or click';
    document.body.classList.toggle('picking', !live);
    void el.offsetWidth; // restart the deal-in animation when a queued pick follows at once
    el.classList.add('on');
  }
  // The pick flashes and the rest fall away; the world is already running underneath.
  hideBoons(picked = -1) {
    const el = this.$('.boons');
    if (!el.classList.contains('on')) return;
    el.querySelector(`.card[data-i="${picked}"]`)?.classList.add('picked');
    el.classList.add('out');
    document.body.classList.remove('picking');
    clearTimeout(this.boonOut);
    this.boonOut = setTimeout(() => el.classList.remove('on', 'out'), 380);
  }
  showEnd(won) {
    const g = this.g, t = g.telemetry.summary();
    if (g.guest && g.squad?.k != null) { t.kills = g.squad.k; t.maxChain = Math.max(t.maxChain, g.squad.ch ?? 0); }
    const { grade, score, parts } = gradeRun(t, won);
    // Bot, god-mode and skip-ahead runs are graded but never set records.
    const { old, next, broke } = recordBests(t, won, grade, !g.bot && !g.god && g.opts.start == null && !g.opts.boons && g.lapEarned, g.lap);
    const mmss = s => s == null ? '--' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const stamp = k => broke[k] ? '<i class="nb">NEW BEST</i>' : '';
    const metric = (ic, label, val, part, k, i) => `<div class="m" style="--d:${0.25 + i * 0.12}s"><span class="mi">${METRIC_ICONS[ic]}</span><span class="ml">${label}</span><b>${val}</b><em><u style="width:${Math.round(part * 100)}%"></u></em>${stamp(k)}</div>`;
    const counts = new Map();
    for (const id of g.player.boons ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    const cards = [...counts].map(([id, n], i) => { const b = boonById(id); return b ? `<div class="bc" style="--d:${0.9 + i * 0.06}s" title="${b.desc}">${icon(b.icon)}<span>${b.name}</span>${n > 1 ? `<em>x${n}</em>` : ''}</div>` : ''; }).join('');
    const el = this.$('.end');
    el.innerHTML = `<div class="sheet">
      ${g.lap > 1 || won ? `<div class="laptag">${icon('lap')}<b>LAP ${g.lap}</b><span>${won ? 'cleared' : g.theme.name.toLowerCase()}</span></div>` : ''}
      <h1>${won ? 'EVERYTHING IS DEAD' : 'ADORABLY MURDERED'}</h1>
      <h2>${won ? (g.lap > 1 ? `lap ${g.lap} of the garden, spotless. lap ${g.lap + 1} is meaner.` : 'the garden is spotless. well, no.') : `popped in ${g.level.rooms[g.currentRoom]?.name ?? 'the garden'}${g.lap > 1 ? ` on lap ${g.lap}` : ''}`}</h2>
      <div class="top">
        <div class="grade g${grade}">${ROSETTE}<b>${grade}</b><small>${score} pts</small>${stamp('grade')}</div>
        <div class="metrics">
          ${metric('clock', won ? 'time' : 'survived', mmss(t.time), parts.time, 'time', 0)}
          ${metric('heart', 'damage taken', Math.round(t.taken), parts.taken, null, 1)}
          ${metric('pinball', 'best pinball', 'x' + t.maxChain, parts.chain, 'chain', 2)}
          ${metric('skull', 'bugs squished', t.kills, parts.kills, null, 3)}
        </div>
      </div>
      <div class="bests"><span class="bl">personal bests</span><span>time <b>${mmss(next.time)}</b></span><span>grade <b>${next.grade ?? '--'}</b></span><span>chain <b>x${next.chain ?? 0}</b></span><span>deepest lap <b>${next.lap ?? 1}</b>${broke.lap ? ' <i class="nb inl">NEW BEST</i>' : ''}</span>${old.grade == null ? '<span class="first">first run on record</span>' : ''}</div>
      <div class="extras"><span><b>${t.gibs}</b> pieces</span><span><b>${t.droplets}</b> drops of blood</span><span><b>${t.wallSlams}</b> wall splats</span><span><b>${t.bestStreak}</b> best streak</span><span><b>LV ${g.level_}</b></span>${g.lap > 1 && g.runTotals ? `<span><b>${g.runTotals.kills + t.kills}</b> bugs this run</span>` : ''}</div>
      ${cards ? `<div class="build"><span class="bl">your build</span><div class="cards">${cards}</div></div>` : '<div class="build"><span class="bl">no boons taken. brave.</span></div>'}
      <p>${g.guest ? 'waiting for the host…' : `<button class="again" type="button">${won ? `another lap: lap ${g.lap + 1}` : 'new run'}</button><small class="hint">or press ENTER</small>`}</p>
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
