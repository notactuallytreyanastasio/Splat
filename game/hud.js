// DOM HUD: Diablo-style health and rage orbs, XP strip, streak counter, banners, boss bar,
// boon picker and end screen.

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
    if (boss) {
      this.$('.boss .fill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
      this.bossBar(boss);
    }
    if (this.cineT > 0 && (this.cineT -= dt) <= 0) this.$('.cine')?.classList.remove('on');
    if (this.cardT > 0 && (this.cardT -= dt) <= 0) { const c = this.$('.bosscard'); c.classList.remove('on'); c.classList.add('off'); }
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
    const t = this.g.telemetry.summary();
    const el = this.$('.end');
    el.innerHTML = `<h1>${won ? 'YOU WIN! EVERYTHING IS DEAD' : 'YOU WERE ADORABLY MURDERED'}</h1>
      <div class="stats">
        <div><b>${t.kills}</b>bugs squished</div><div><b>${t.gibs}</b>pieces</div><div><b>${t.droplets}</b>drops of blood</div>
        <div><b>${t.bestStreak}</b>best streak</div><div><b>${t.maxChain}</b>best pinball</div><div><b>${t.wallSlams}</b>wall splats</div>
        <div><b>${Math.round(t.time)}s</b>time</div><div><b>LV ${this.g.level_}</b>${(this.g.player.boons ?? []).length} boons</div>
      </div><p>${this.g.guest ? 'waiting for the host…' : `<button class="again">${won ? 'another lap' : 'new run'}</button> or press ENTER`}</p>`;
    el.classList.add('on');
    const again = el.querySelector('.again');
    if (again) again.onclick = () => { this.g.againTapped = true; };
  }
}
