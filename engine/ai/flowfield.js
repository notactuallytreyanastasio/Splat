// Breadth-first distance field over a TileMap. One field toward the player serves every
// chaser; path() gives a single route (used by the autopilot).
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class FlowField {
  constructor(map) {
    this.map = map;
    this.dist = new Int32Array(map.w * map.h);
    this.tx = -1; this.tz = -1;
  }
  passable(x, z) { return this.map.walkable(x, z); }
  neighbours(x, z, fn) {
    for (const [dx, dz] of N8) {
      const nx = x + dx, nz = z + dz;
      if (!this.passable(nx, nz)) continue;
      // No diagonal squeezing between two walls.
      if (dx && dz && (!this.passable(x + dx, z) || !this.passable(x, z + dz))) continue;
      fn(nx, nz);
    }
  }
  compute(x, z, force = false) {
    const tx = Math.floor(x), tz = Math.floor(z), w = this.map.w;
    if (!force && tx === this.tx && tz === this.tz) return;
    this.tx = tx; this.tz = tz;
    this.dist.fill(-1);
    if (!this.map.inside(tx, tz)) return;
    const q = [tx, tz];
    this.dist[tz * w + tx] = 0;
    for (let h = 0; h < q.length; h += 2) {
      const cx = q[h], cz = q[h + 1], cd = this.dist[cz * w + cx];
      this.neighbours(cx, cz, (nx, nz) => {
        if (this.dist[nz * w + nx] !== -1) return;
        this.dist[nz * w + nx] = cd + 1;
        q.push(nx, nz);
      });
    }
  }
  distAt(x, z) { const tx = Math.floor(x), tz = Math.floor(z); return this.map.inside(tx, tz) ? this.dist[tz * this.map.w + tx] : -1; }
  // Direction toward the target from a world position, or null if unreachable.
  dirAt(x, z) {
    const tx = Math.floor(x), tz = Math.floor(z), w = this.map.w;
    let best = this.distAt(x, z), bx = 0, bz = 0;
    if (best <= 0) return null;
    this.neighbours(tx, tz, (nx, nz) => {
      const d = this.dist[nz * w + nx];
      if (d >= 0 && d < best) { best = d; bx = nx + 0.5 - x; bz = nz + 0.5 - z; }
    });
    const l = Math.hypot(bx, bz);
    return l ? { x: bx / l, z: bz / l } : null;
  }
  path(sx, sz, gx, gz) {
    const w = this.map.w, start = Math.floor(sz) * w + Math.floor(sx), goal = Math.floor(gz) * w + Math.floor(gx);
    const prev = new Int32Array(w * this.map.h).fill(-1);
    prev[start] = start;
    const q = [start];
    for (let h = 0; h < q.length && prev[goal] === -1; h++) {
      const c = q[h];
      this.neighbours(c % w, (c / w) | 0, (nx, nz) => {
        const n = nz * w + nx;
        if (prev[n] === -1) { prev[n] = c; q.push(n); }
      });
    }
    if (prev[goal] === -1) return null;
    const out = [];
    for (let c = goal; c !== start; c = prev[c]) out.push({ x: (c % w) + 0.5, z: ((c / w) | 0) + 0.5 });
    return out.reverse();
  }
}
