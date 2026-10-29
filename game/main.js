import { Game } from './game.js';
import { Net, DEFAULT_SERVER } from './net.js';

const q = new URLSearchParams(location.search);
const num = k => (q.has(k) ? +q.get(k) : undefined);
const status = msg => { const el = document.getElementById('hud'); el.innerHTML = `<div class="lobby">${msg}</div>`; };
const NAMES = ['Petal', 'Stinger', 'Gumdrop', 'Thimble', 'Mothball', 'Sprinkle', 'Bramble', 'Nectar', 'Pip', 'Clover'];

const coop = q.get('coop');
// ?tutorial: the How to play lessons on their own little lawn (solo only). A first visit
// with a bare URL (tracking tags aside) goes there too: nobody has finished, skipped or
// left the tutorial in this browser, and there are no personal bests from a real run.
const seen = (() => { try { return !!(localStorage.getItem('pgm.tutorial') || localStorage.getItem('pgm.bests')); } catch { return true; } })();
const bare = [...q.keys()].every(k => k.startsWith('utm_') || k === 'fbclid' || k === 'ref');
const firstVisit = bare && !seen;
const tutorial = (q.has('tutorial') || firstVisit) && !coop;
let level = tutorial ? 'tutorial' : q.get('level') || 'garden', seed = num('seed'), lap = num('lap'), net = null;
if (coop) {
  // Co-op: join the room on the blog's Phoenix server. The earliest player hosts;
  // a guest takes the seed and level from the host's first world snapshot.
  status(`joining garden <b>${coop}</b>…`);
  const name = q.get('name') || NAMES[(Math.random() * NAMES.length) | 0] + ' ' + ((Math.random() * 90 + 10) | 0);
  net = new Net({ url: q.get('server') || DEFAULT_SERVER, room: coop, name });
  try { await net.connect(); } catch (e) { status(`could not join <b>${coop}</b>: ${e.message}. <a href="?">play solo</a>`); throw e; }
  if (!net.isHost) {
    status(`in garden <b>${coop}</b> — waiting for the host to start…`);
    const first = await new Promise(res => net.on('w', m => res(m)));
    seed = first.seed; level = first.level; lap = first.lap ?? 1; // the host decides the lap
  }
}
// 'local:<name>' plays an unsaved editor draft from localStorage (works on static hosting).
const json = level.startsWith('local:')
  ? JSON.parse(localStorage.getItem('level:' + level.slice(6)))
  : await (await fetch(`game/levels/${level}.json`, { cache: 'no-store' })).json();
document.getElementById('hud').innerHTML = '';
const game = new Game(document.getElementById('game'), json, {
  seed, lap, levelName: level, net, bot: q.has('bot'), speed: num('speed'), god: q.has('god'), start: num('start'), difficulty: num('difficulty'), botskill: num('botskill'), perf: q.has('perf'), tutorial, firstVisit, boons: q.get('boons'),
});
// Debug/automation surface used by tools/playtest.mjs.
window.__game = game;
window.__summary = () => game.telemetry.summary();
