// One-off generator for the starter dungeon. After this, edit levels in editor.html.
import fs from 'node:fs';

const W = 48, H = 68;
const g = Array.from({ length: H }, () => Array(W).fill(' '));
const carve = (x0, z0, x1, z1) => {
  for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    const inside = x >= x0 && x <= x1 && z >= z0 && z <= z1;
    if (inside) g[z][x] = '.';
    else if (g[z][x] === ' ') g[z][x] = '#';
  }
};
const put = (ch, ...pts) => { for (const [x, z] of pts) g[z][x] = ch; };

carve(2, 2, 15, 13);    // 1: the Petal Foyer
carve(17, 7, 21, 9);
carve(23, 1, 40, 16);   // 2: the Mushroom Court
carve(30, 18, 32, 22);
carve(22, 24, 41, 39);  // 3: the Beetle Den
carve(30, 41, 32, 44);
carve(16, 46, 45, 65);  // 4: the Empress's Bower
put('+', [16, 8], [22, 8], [31, 17], [31, 23], [31, 40], [31, 45]);

put(',', [4, 7], [5, 7], [6, 7], [4, 8], [6, 8], [4, 9], [5, 9], [6, 9], [3, 8], [7, 8]);
put('@', [5, 8]);
put('l', [11, 4], [12, 6], [13, 10], [10, 11], [14, 12], [13, 3]);
put('j', [3, 3], [15, 2], [3, 13]);
put('o', [8, 4], [8, 12]);
put('*', [2, 2], [15, 13], [2, 6]);

put('o', [27, 5], [36, 5], [27, 12], [36, 12]);
put('l', [30, 4], [33, 4], [31, 8], [35, 9], [29, 10]);
put('c', [38, 3], [25, 14]);
put('f', [39, 14], [24, 2]);
put('j', [40, 1], [23, 16], [40, 16]);
put('*', [23, 1], [32, 1]);

put('o', [27, 28], [37, 35], [31, 32]);
put('B', [28, 33], [36, 30]);
put('l', [25, 27], [38, 27], [26, 37], [39, 36]);
put('f', [24, 31], [40, 33]);
put('c', [33, 37]);
put('j', [22, 24], [41, 39], [41, 24]);
put('*', [22, 39], [23, 39]);

put('o', [21, 50], [41, 50], [21, 61], [41, 61]);
put('M', [31, 58]);
put('*', [16, 46], [45, 46], [16, 65], [45, 65], [17, 46], [44, 46]);
put(',', ...Array.from({ length: 7 }, (_, i) => [28 + i, 58]), ...Array.from({ length: 7 }, (_, i) => [31, 55 + i]));
put('M', [31, 58]);

const rows = g.map(r => r.join('').replace(/\s+$/, ''));
fs.writeFileSync('game/levels/garden.json', JSON.stringify({ name: 'The Pastel Garden', rows }, null, 1) + '\n');
console.log(rows.join('\n'));
