// Phoenix channel client for co-op. The server (BlogWeb.GardenChannel in the blog app)
// only relays and tracks presence; the host is whoever has the earliest joined_at.
import { Socket } from '../vendor/phoenix.mjs';

// The blog's Phoenix app is served at old.bobbby.online; bobbby.online 308s to it, which a WebSocket cannot follow.
export const DEFAULT_SERVER = 'wss://old.bobbby.online/socket';

export class Net {
  constructor({ url = DEFAULT_SERVER, room, name }) {
    Object.assign(this, { url, room, name });
    this.handlers = {};
    this.peers = new Map();
    this.joined = false;
    this.sent = 0; this.recv = 0;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new Socket(this.url, { heartbeatIntervalMs: 15000 });
      this.socket.onError(() => this.emit('error'));
      this.socket.connect();
      this.ch = this.socket.channel('garden:' + this.room, { name: this.name });
      for (const ev of ['p', 'w', 'e', 'a']) this.ch.on(ev, msg => { this.recv += 1; this.emit(ev, msg); });
      this.ch.on('presence_state', st => {
        this.peers.clear();
        for (const [id, { metas }] of Object.entries(st)) this.peers.set(id, metas[0]);
        this.emit('peers');
        if (!this.ready) { this.ready = true; resolve(this); }
      });
      this.ch.on('presence_diff', ({ joins, leaves }) => {
        for (const id of Object.keys(leaves)) if (!joins[id]) this.peers.delete(id);
        for (const [id, { metas }] of Object.entries(joins)) this.peers.set(id, metas[0]);
        this.emit('peers');
      });
      this.ch.join()
        .receive('ok', r => { this.id = r.id; this.joined = true; })
        .receive('error', e => reject(new Error(e.reason || 'join failed')))
        .receive('timeout', () => reject(new Error('timed out joining')));
    });
  }
  get hostId() {
    let best = null;
    for (const [id, m] of this.peers) if (!best || m.joined_at < best[1].joined_at || (m.joined_at === best[1].joined_at && id < best[0])) best = [id, m];
    return best?.[0];
  }
  get isHost() { return this.hostId === this.id; }
  send(ev, payload) { if (this.joined) { this.sent += 1; this.ch.push(ev, payload); } }
  on(ev, fn) { (this.handlers[ev] ??= []).push(fn); }
  emit(ev, msg) { for (const f of this.handlers[ev] ?? []) f(msg); }
}
