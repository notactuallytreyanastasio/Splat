// Entities, circle-vs-tile collision and body-vs-body contact. A body moving faster than
// its launchSpeed is "launched": contacts it makes are reported through onImpact, which
// is how a game turns a knocked-back enemy into a projectile.
export class Entity {
  constructor(x = 0, z = 0) {
    this.x = x; this.z = z; this.y = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.radius = 0.4;
    this.mass = 1;
    this.restitution = 0.2;
    this.body = false;        // takes part in body-vs-body contact
    this.collides = true;     // collides with tiles
    this.launchSpeed = Infinity;
    this.dead = false;
    this.age = 0;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get launched() { return this.speed > this.launchSpeed; }
  update(dt) {}
  onAdd() {}
  onRemove() {}
  onWall(hit) {}
}

export class World {
  constructor(map) {
    this.map = map;
    this.entities = [];
    this.onImpact = null; // (mover, other, relativeSpeed) => void
    // (entity, hit) => true when the game takes over a tile contact (a bumper, say): the
    // entity's onWall is skipped and move() returns null. hit carries tx, tz of the tile.
    this.onTile = null;
    // Stable ids so a network peer can name an entity. Proxies arrive with theirs.
    this.byId = new Map();
    this.nextId = 1;
  }
  add(e) {
    e.world = this;
    e.nid ??= this.nextId++;
    this.byId.set(e.nid, e);
    this.entities.push(e);
    e.onAdd();
    return e;
  }
  update(dt) {
    // A proxy mirrors an entity simulated elsewhere: it is smoothed, not simulated.
    for (const e of this.entities) if (!e.dead) { e.age += dt; e.proxy ? e.netStep?.(dt) : e.update(dt); }
    this.contacts();
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.dead) { this.entities.splice(i, 1); this.byId.delete(e.nid); e.onRemove(); }
    }
  }
  query(x, z, r, filter) {
    const out = [];
    for (const e of this.entities) {
      if (e.dead || (filter && !filter(e))) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d <= r + e.radius) out.push(e);
    }
    return out;
  }
  nearest(x, z, filter, maxDist = Infinity) {
    let best = null, bd = maxDist;
    for (const e of this.entities) {
      if (e.dead || (filter && !filter(e))) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // Integrate horizontal velocity with sub-steps so launched bodies cannot tunnel walls.
  move(e, dt) {
    const dist = Math.hypot(e.vx, e.vz) * dt;
    const steps = Math.max(1, Math.ceil(dist / (e.radius * 0.5)));
    let wall = null;
    for (let s = 0; s < steps; s++) {
      e.x += (e.vx * dt) / steps;
      e.z += (e.vz * dt) / steps;
      if (e.collides) {
        const hit = this.collideTiles(e);
        if (hit && (!wall || hit.speed > wall.speed)) wall = hit;
      }
    }
    if (wall && this.onTile?.(e, wall)) return null;
    if (wall) e.onWall(wall);
    return wall;
  }
  collideTiles(e) {
    const r = e.radius, map = this.map;
    let hit = null;
    for (let tz = Math.floor(e.z - r); tz <= Math.floor(e.z + r); tz++) {
      for (let tx = Math.floor(e.x - r); tx <= Math.floor(e.x + r); tx++) {
        if (!map.isSolid(tx, tz)) continue;
        const cx = Math.max(tx, Math.min(e.x, tx + 1)), cz = Math.max(tz, Math.min(e.z, tz + 1));
        let dx = e.x - cx, dz = e.z - cz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d < 1e-6) {
          // Centre inside the tile: leave by the nearest edge.
          const ex = [e.x - tx, tx + 1 - e.x, e.z - tz, tz + 1 - e.z], m = Math.min(...ex), k = ex.indexOf(m);
          dx = [-1, 1, 0, 0][k]; dz = [0, 0, -1, 1][k]; d = 0;
          e.x += dx * (m + r); e.z += dz * (m + r);
        } else {
          dx /= d; dz /= d;
          e.x += dx * (r - d); e.z += dz * (r - d);
        }
        const vn = e.vx * dx + e.vz * dz;
        if (vn < 0) {
          if (!hit || -vn > hit.speed) hit = { nx: dx, nz: dz, speed: -vn, tx, tz };
          e.vx -= (1 + e.restitution) * vn * dx;
          e.vz -= (1 + e.restitution) * vn * dz;
        }
      }
    }
    return hit;
  }
  contacts() {
    const list = this.entities.filter(e => e.body && !e.dead);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      // Launched bodies get a fatter contact radius: projectiles should be easy to land.
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.radius + b.radius + (a.launched || b.launched ? 0.3 : 0);
      if (d >= min || Math.abs(a.y - b.y) > 1.2) continue;
      const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (this.onImpact && rel > 0) {
        if (a.launched) this.onImpact(a, b, rel);
        else if (b.launched) this.onImpact(b, a, rel);
      }
      const push = Math.max(0, a.radius + b.radius - d) / (a.mass + b.mass);
      a.x -= nx * push * b.mass; a.z -= nz * push * b.mass;
      b.x += nx * push * a.mass; b.z += nz * push * a.mass;
    }
  }
}
