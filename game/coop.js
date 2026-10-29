// Co-op over a Phoenix channel. One peer (the host) simulates the world; every peer
// simulates its own knight so moving and swinging never wait on the network.
//
//   every peer -> "p"  own knight's state, 20/s
//   host       -> "w"  world snapshot (enemies, loot, doors, xp), 15/s
//   host       -> "e"  effect events (hits, kills, banners, targeted hurt/teleport), batched
//   guest      -> "a"  action requests (swing, whirl, grab, throw) that the host resolves
import { Player, Enemy, Mantis, Pollen, Gem, Potion, Breakable } from './actors.js';

const r2 = v => Math.round(v * 100) / 100;
export const TINTS = [
  { helm: 0x9ff0d4, ring: 0xff5fa2 },
  { helm: 0xffb3d1, ring: 0x6ec6ff },
  { helm: 0xfff1a1, ring: 0x7bdc8f },
  { helm: 0xc8b2ff, ring: 0xffa04d },
];
const KIND = e => (e instanceof Mantis ? 'M' : e instanceof Enemy ? 'E' : e instanceof Pollen ? 'P' : e instanceof Gem ? 'G' : e instanceof Potion ? 'O' : e instanceof Breakable ? 'B' : null);

export class Coop {
  constructor(game, net) {
    this.g = game;
    this.net = net;
    this.id = net.id;
    // Roles are fixed for the run: there is no host migration, the world lives with the host.
    this.hostId = net.hostId;
    this.remotes = new Map();   // peer id -> Player proxy
    this.outbox = [];
    this.pT = 0; this.wT = 0;
    this.swings = 0;
    this.killed = new Set();
    this.lastSnap = 0;
    net.on('p', m => this.onPlayer(m));
    net.on('e', m => { if (m.from === this.hostId) for (const [t, d] of m.l) this.onEvent(t, d); });
    net.on('w', m => { if (m.from === this.hostId && !this.isHost) this.onWorld(m); });
    net.on('a', m => { if (this.isHost) this.onAction(m); });
    net.on('peers', () => this.onPeers());
  }
  get isHost() { return this.hostId === this.id; }
  get isGuest() { return !this.isHost; }
  colorIndex(id) { return [...this.net.peers.keys()].sort().indexOf(id) % TINTS.length; }

  // ------------------------------------------------------------ per-step
  update(dt) {
    const g = this.g;
    this.pT -= dt; this.wT -= dt;
    if (this.pT <= 0) { this.pT = 0.05; this.sendPlayer(); }
    if (this.isHost && this.wT <= 0) {
      this.wT = 1 / 15;
      if (this.outbox.length) { this.net.send('e', { l: this.outbox }); this.outbox = []; }
      this.net.send('w', this.snapshot());
    }
    if (this.isGuest && this.outbox.length) this.outbox = [];
    // A host that never speaks again has left; presence tells us, this is the backstop.
    if (this.isGuest && this.lastSnap && performance.now() - this.lastSnap > 6000 && !this.warned) { this.warned = true; g.hud.banner('HOST VANISHED', 'their garden, their rules', 4); }
  }
  broadcast(type, d) { if (this.isHost) this.outbox.push([type, d]); }

  // ------------------------------------------------------------ own knight
  sendPlayer() {
    const p = this.g.player;
    if (['light', 'finisher', 'heavy'].includes(p.state) && p.stateT < 0.05 && this._lastSwingState !== p.stateT) this.swings++;
    this._lastSwingState = p.stateT;
    this.net.send('p', {
      x: r2(p.x), z: r2(p.z), y: r2(p.y), vx: r2(p.vx), vz: r2(p.vz), f: r2(p.facing),
      a: p.action ?? 0, ap: r2(p.actionP), cb: p.comboStep ?? 0, hp: Math.ceil(p.hp), mx: p.stats.maxHp,
      rg: Math.floor(p.rage), dd: p.dead || p.ghost ? 1 : 0, iv: p.state === 'dodge' || p.inv > 0 ? 1 : 0,
      sw: p.swingCount ?? 0, nm: this.net.name, ax: r2(p.aimX), az: r2(p.aimZ),
    });
  }
  onPlayer(m) {
    let rp = this.remotes.get(m.from);
    if (!rp) {
      rp = new Player(this.g, m.x, m.z, TINTS[this.colorIndex(m.from)]);
      rp.proxy = true; rp.remote = true; rp.pid = m.from; rp.name = m.nm;
      rp.netStep = dt => this.stepRemote(rp, dt);
      this.g.world.add(rp);
      this.remotes.set(m.from, rp);
      this.g.hud.roster();
      this.g.hud.banner('', `${m.nm} joined the massacre`, 2);
    }
    rp.net = m;
    rp.name = m.nm;
    if (m.sw !== rp.lastSw && rp.lastSw != null && ['light', 'finisher', 'heavy'].includes(m.a)) { this.g.slash(rp, m.a); this.g.sfx.play('swing'); }
    rp.lastSw = m.sw;
    rp.hp = m.hp; rp.stats.maxHp = m.mx; rp.rage = m.rg;
    rp.ghost = !!m.dd;
    rp.aimX = m.ax; rp.aimZ = m.az;
  }
  stepRemote(rp, dt) {
    const m = rp.net;
    if (!m) return;
    const k = Math.min(1, dt * 14);
    // Aim a little ahead along their velocity so the knight is not always 50ms behind.
    rp.x += (m.x + m.vx * 0.05 - rp.x) * k; rp.z += (m.z + m.vz * 0.05 - rp.z) * k; rp.y += (m.y - rp.y) * k;
    rp.vx = m.vx; rp.vz = m.vz;
    rp.facing = m.f; rp.action = m.a || null; rp.actionP = m.ap; rp.combo = m.cb;
    rp.inv = m.iv ? 0.2 : 0; rp.state = m.iv ? 'dodge' : 'move';
    rp.parryT -= dt;
    rp.rig.root.visible = !rp.ghost;
    rp.springs(dt);
    if (rp.holding) {
      const h = rp.holding;
      if (h.dead || h.carried !== rp) rp.holding = null;
      else { h.x = rp.x; h.z = rp.z; h.y = 1.6; h.vx = h.vy = h.vz = 0; h.facing = rp.facing; h.tumble = Math.PI + Math.sin(rp.t * 18) * 0.25; h.carryT = (h.carryT ?? 0) + dt; }
    }
  }
  onPeers() {
    for (const [id, rp] of this.remotes) if (!this.net.peers.has(id)) {
      rp.dead = true;
      this.remotes.delete(id);
      this.g.hud.banner('', `${rp.name ?? 'a knight'} left`, 2);
    }
    if (this.isGuest && !this.net.peers.has(this.hostId) && !this.warned) { this.warned = true; this.g.hud.banner('THE HOST LEFT', 'the garden went with them', 6); }
    this.g.hud.roster();
  }
  player(id) { return id === this.id ? this.g.player : this.remotes.get(id); }

  // ------------------------------------------------------------ guest -> host requests
  request(t, d = {}) {
    const p = this.g.player, st = p.stats;
    this.net.send('a', { t, ax: r2(p.aimX), az: r2(p.aimZ), x: r2(p.x), z: r2(p.z), st: { damage: st.damage, crit: st.crit, critMul: st.critMul, knock: st.knock, reach: st.reach, wallDamage: st.wallDamage, explodeOnKill: st.explodeOnKill, throwPower: st.throwPower, ricochet: st.ricochet, sticky: st.sticky, grabRange: st.grabRange, grabAny: st.grabAny, bowling: st.bowling }, ...d });
  }
  onAction(m) {
    const rp = this.remotes.get(m.from);
    if (!rp || rp.ghost) return;
    rp.x = m.x; rp.z = m.z; rp.aimX = m.ax; rp.aimZ = m.az;
    Object.assign(rp.stats, m.st);
    if (m.t === 'swing') { rp.hitSet.clear(); rp.swing(m.k); }
    else if (m.t === 'whirl') rp.whirlHit();
    else if (m.t === 'grab') { if (!rp.holding && rp.tryGrab()) this.g.fx('grabbed', { to: m.from, id: rp.holding.nid }); }
    else if (m.t === 'throw') { if (rp.holding) rp.throwHeld(m.pw ?? 1); }
    else if (m.t === 'parry') { rp.parryT = 0.3; }
  }

  // ------------------------------------------------------------ host -> guests world
  snapshot() {
    const g = this.g, ents = [];
    for (const e of g.world.entities) {
      if (e.dead || e instanceof Player) continue;
      const k = KIND(e);
      if (!k) continue;
      const row = [e.nid, k, k === 'E' ? e.type : k === 'G' ? e.value : k === 'B' ? e.kind : k === 'P' ? (e.heart ? 1 : 0) : 0, r2(e.x), r2(e.y), r2(e.z)];
      if (k === 'E' || k === 'M') {
        const flags = (e.elite ? 1 : 0) | (e.active ? 2 : 0) | (e.launched ? 4 : 0) | (e.baby ? 8 : 0) | (e.stun > 0.2 ? 16 : 0);
        row.push(r2(e.facing), r2(e.spinYaw), r2(e.tumble), r2(e.squash), r2(e.leanX), r2(e.leanZ), e.action ?? 0, r2(e.actionP), r2(e.flash), flags, Math.ceil(e.hp), e.carried?.pid ?? (e.carried ? this.id : 0));
        if (k === 'M') row.push(e.state, e.next ?? 0, r2(e.lockX ?? 0), r2(e.lockZ ?? 0), r2(e.stateT));
      }
      ents.push(row);
    }
    const L = g.level;
    return {
      seed: g.seed, level: g.levelName, ents,
      doors: L.doors.map(d => (d.open ? 1 : 0)).join(''),
      rooms: L.rooms.map(r => (r.cleared ? 2 : r.active ? 1 : 0)).join(''),
      xp: g.xp, lvl: g.level_, gems: g.gems, boss: g.boss?.nid ?? 0,
    };
  }
  onWorld(m) {
    const g = this.g;
    this.lastSnap = performance.now();
    const seen = new Set();
    for (const row of m.ents) {
      const [nid, k, type, x, y, z] = row;
      seen.add(nid);
      if (this.killed.has(nid)) continue;
      let e = g.world.byId.get(nid);
      if (!e) e = this.spawnProxy(nid, k, type, x, z, row);
      // Velocity from successive snapshots, so guest-side threat cues see shots coming.
      const now = performance.now() / 1000;
      if (e.target && e.snapT) { const ds = Math.max(0.02, now - e.snapT); e.vx = (x - e.target[3]) / ds; e.vz = (z - e.target[5]) / ds; }
      e.snapT = now;
      e.target = row;
      if (k === 'E' || k === 'M') {
        const [, , , , , , f, spin, tumble, squash, lx, lz, action, ap, flash, flags, hp, carrier] = row;
        Object.assign(e, { tf: f, spinYaw: spin, tumble, squash, leanX: lx, leanZ: lz, action: action || null, actionP: ap, flash: Math.max(e.flash, flash), hp, active: !!(flags & 2), baby: !!(flags & 8), stun: flags & 16 ? 1 : 0 });
        if (!(flags & 4) && e.launchedFx) e.launchedFx = false;
        e.launchedFx = !!(flags & 4);
        const carriedBy = carrier ? this.player(carrier) : null;
        if (carriedBy !== g.player || !carriedBy) e.carried = carriedBy ?? null;
        if (k === 'E') e.state = action === 'windup' ? 'windup' : 'chase';
        if (k === 'M') { [e.state, e.next, e.lockX, e.lockZ, e.stateT] = row.slice(18); }
      }
    }
    for (const e of g.world.entities) if (e.proxy && !(e instanceof Player) && !seen.has(e.nid)) e.dead = true;
    // Doors and rooms mirror the host: closed gates are walls for our own knight too.
    L: {
      const L = g.level;
      L.doors.forEach((d, i) => { const open = m.doors[i] === '1'; if (d.open !== open) g.setDoor(d, open); });
      L.rooms.forEach((r, i) => { const s = m.rooms[i]; r.cleared = s === '2'; r.active = s === '1'; });
    }
    if (m.lvl > g.level_) { g.level_ = m.lvl; g.offerBoon(); }
    if (m.gems > g.gems) g.sfx.play('pickup', { pitch: 1 + Math.random() * 0.4, gap: 0.03 });
    g.xp = m.xp; g.gems = m.gems;
    g.boss = m.boss ? g.world.byId.get(m.boss) ?? null : null;
  }
  spawnProxy(nid, k, type, x, z, row) {
    const g = this.g;
    let e;
    if (k === 'E') e = new Enemy(g, x, z, type, { elite: !!(row[15] & 1) });
    else if (k === 'M') e = new Mantis(g, x, z, -1);
    else if (k === 'P') e = new Pollen(g, x, z, 0, 0, 0, { heart: !!type });
    else if (k === 'G') e = new Gem(g, x, z, type);
    else if (k === 'O') e = new Potion(g, x, z);
    else e = new Breakable(g, x, z, type);
    e.nid = nid; e.proxy = true; e.mass = 1000; e.launchSpeed = Infinity;
    e.netStep = dt => this.stepProxy(e, dt);
    g.world.add(e);
    return e;
  }
  stepProxy(e, dt) {
    const t = e.target;
    if (!t) return;
    if (e.carried && e.carried === this.g.player) return; // our own knight holds it: we place it
    const k = Math.min(1, dt * 15);
    e.x += (t[3] - e.x) * k; e.y += (t[4] - e.y) * k; e.z += (t[5] - e.z) * k;
    if (e.rig) {
      e.facing += Math.atan2(Math.sin(e.tf - e.facing), Math.cos(e.tf - e.facing)) * k;
      e.flash = Math.max(0, e.flash - dt * 7);
      if (e.launchedFx && Math.random() < dt * 40) this.g.gore.trail(e);
      if (e.elite) e.rig.kit.flash(0.2, 0xffffff);
    } else if (e.mesh) {
      e.mesh.position.set(e.x, e.y + (e instanceof Gem || e instanceof Potion ? Math.sin(e.age * 4) * 0.06 : 0), e.z);
      e.mesh.rotation.y += dt * 3;
    }
  }

  // ------------------------------------------------------------ host -> guests events
  onEvent(t, d) {
    const g = this.g;
    if (d.to && d.to !== this.id) {
      // Targeted at someone else; a few still have a visible side for everyone.
      if (t === 'grabbed') { const rp = this.remotes.get(d.to), e = g.world.byId.get(d.id); if (rp && e) { rp.holding = e; e.carried = rp; } }
      return;
    }
    if (t === 'kill') this.killed.add(d.id);
    g.applyFx(t, d);
  }
}
