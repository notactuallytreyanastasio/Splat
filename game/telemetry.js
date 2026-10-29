// Measures the things that make the game feel good or bad, so a bot playthrough can be
// judged by numbers: how often something juicy happens, how long you walk around
// bored, how close fights get.
export class Telemetry {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.c = { kills: 0, overkills: 0, hits: 0, swings: 0, dealt: 0, taken: 0, impacts: 0, maxChain: 0, chains: 0, wallSlams: 0, grabs: 0, throws: 0, reflects: 0, parries: 0, specials: 0, potions: 0, levels: 0, breakables: 0, crits: 0, deaths: 0, ricochets: 0, bombs: 0, strikes: 0, yanks: 0 };
    this.idle = 0; this.combat = 0; this.lowHp = 1; this.juice = 0;
    this.rooms = [];
    this.log = [];
    this.boons = [];
    this.won = false;
    this.lastJuice = 0;
    this.longestDry = 0;
  }
  ev(type, data) { this.log.push({ ...data, t: +this.t.toFixed(2), type }); if (this.log.length > 500) this.log.shift(); }
  juicy() { this.juice++; this.longestDry = Math.max(this.longestDry, this.t - this.lastJuice); this.lastJuice = this.t; }
  update(dt) {
    this.t += dt;
    const g = this.g, p = g.player;
    const room = g.level.rooms[g.currentRoom];
    if (room?.active) this.combat += dt; else this.idle += dt;
    if (!p.dead) this.lowHp = Math.min(this.lowHp, p.hp / p.stats.maxHp);
  }
  enterRoom(room) { this.ev('enter', { room: room.id, name: room.name }); if (room.combat && !room.cleared) this.rooms.push({ id: room.id, name: room.name, enter: this.t, hpIn: this.g.player.hp }); }
  clearRoom(room) {
    const r = this.rooms.find(r => r.id === room.id);
    if (r) { r.clear = this.t; r.dur = +(this.t - r.enter).toFixed(1); r.hpOut = Math.round(this.g.player.hp); }
    this.ev('clear', { room: room.id, name: room.name });
  }
  hit(target, info) {
    if (target === this.g.player) { this.c.taken += info.amount; this.ev('hurt', { amount: info.amount, by: info.source?.type ?? info.source?.def?.name ?? '?' }); return; }
    this.c.hits++; this.c.dealt += info.amount; if (info.crit) this.c.crits++;
    this.juicy();
  }
  kill(t, info, overkill) { this.c.kills++; if (overkill) this.c.overkills++; this.juicy(); this.ev('kill', { type: t.type ?? 'boss', kind: info.kind, overkill }); }
  impact(chain) { this.c.impacts++; if (chain >= 2) this.c.chains++; this.c.maxChain = Math.max(this.c.maxChain, chain); this.juicy(); }
  wallSlam() { this.c.wallSlams++; this.juicy(); }
  swing() { this.c.swings++; }
  grab() { this.c.grabs++; }
  throw_() { this.c.throws++; }
  reflect() { this.c.reflects++; this.juicy(); }
  special() { this.c.specials++; }
  parry() { this.c.parries++; this.juicy(); }
  potion() { this.c.potions++; }
  levelUp() { this.c.levels++; }
  boon(b) { this.boons.push(b.id); this.ev('boon', { id: b.id }); }
  breakable(kind) { this.c.breakables++; this.juicy(); }
  death(info) { this.c.deaths++; this.ev('death', { by: info.source?.type ?? info.source?.def?.name }); }
  win() { this.won = true; this.ev('win', {}); }
  summary() {
    const g = this.g;
    return {
      seed: g.seed, time: +this.t.toFixed(1), won: this.won, dead: g.player.dead, state: g.state,
      ...this.c,
      accuracy: +(this.c.hits / Math.max(1, this.c.swings)).toFixed(2),
      combatShare: +(this.combat / Math.max(1, this.t)).toFixed(2),
      juicePerMin: +(this.juice / Math.max(1, this.t) * 60).toFixed(1),
      longestDry: +Math.max(this.longestDry, this.t - this.lastJuice).toFixed(1),
      lowestHp: +this.lowHp.toFixed(2),
      bestStreak: g.bestStreak, level: g.level_, boons: this.boons,
      gibs: g.gore.stats.gibs, droplets: g.gore.stats.droplets,
      rooms: this.rooms,
    };
  }
}
