// DOM HUD: Diablo-style health and rage orbs, XP strip, streak counter, banners, boss bar,
// boon picker and end screen.
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
        <div class="keys"><b>WASD</b> move <b>mouse</b> aim <b>LMB</b> slash combo <b>RMB</b> batter-up <b>E</b> grab &amp; throw <b>SPACE</b> roll <b>Q</b> rainbow blender <b>R</b> potion</div>
        <p class="tip">anything you hit hard enough becomes a projectile. so do the bodies.</p>
        <button>click to start squishing</button><small>gamepad works too</small></div>
      <div class="help">WASD move · mouse aim · LMB slash · RMB batter-up · E grab/throw · SPACE dodge · Q blender · R potion</div>`;
    this.$ = s => root.querySelector(s);
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
  title(onStart) {
    const t = this.$('.title');
    t.classList.add('on');
    const go = () => { t.classList.remove('on'); removeEventListener('keydown', key); onStart(); };
    const key = e => { if (e.code === 'Enter' || e.code === 'Space') go(); };
    t.querySelector('button').onclick = go;
    addEventListener('keydown', key);
  }
  hurt() { const v = this.$('.vignette'); v.style.opacity = 0.8; }
  showBoons(offers) {
    const el = this.$('.boons');
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
      </div><p>press ENTER for ${won ? 'another lap' : 'a new run'}</p>`;
    el.classList.add('on');
  }
}
