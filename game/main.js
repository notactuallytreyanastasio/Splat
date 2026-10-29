import { Game } from './game.js';

const q = new URLSearchParams(location.search);
const level = q.get('level') || 'garden';
// 'local:<name>' plays an unsaved editor draft from localStorage (works on static hosting).
const json = level.startsWith('local:')
  ? JSON.parse(localStorage.getItem('level:' + level.slice(6)))
  : await (await fetch(`game/levels/${level}.json`, { cache: 'no-store' })).json();
const num = k => (q.has(k) ? +q.get(k) : undefined);
const game = new Game(document.getElementById('game'), json, {
  seed: num('seed'), bot: q.has('bot'), speed: num('speed'), god: q.has('god'), room: num('room'), difficulty: num('difficulty'), botskill: num('botskill'),
});
// Debug/automation surface used by tools/playtest.mjs.
window.__game = game;
window.__summary = () => game.telemetry.summary();
