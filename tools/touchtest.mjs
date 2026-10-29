// Touch-device check: node tools/touchtest.mjs
// Emulates phones/tablets with real touch events, drives the left stick and the SLASH
// button, and screenshots each layout to tools/out/touch-<device>.png.
import { launch } from './browser.mjs';
import { startServer } from './serve.mjs';

const DEVICES = {
  'iphone-landscape': { width: 844, height: 390, scale: 3 },
  'iphone-portrait': { width: 390, height: 844, scale: 3 },
  'ipad-landscape': { width: 1180, height: 820, scale: 2 },
  'ipad-portrait': { width: 820, height: 1180, scale: 2 },
  'duo-unfolded': { width: 1114, height: 705, scale: 2.5 },
};
const { url, close } = await startServer();
const browser = await launch();
let failed = 0;
for (const [name, d] of Object.entries(DEVICES)) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url + '/?seed=2');
  await page.waitForFunction(() => window.__game);
  await page.tap('.title > button', { force: true });
  await page.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i })) });
  const before = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  // Left thumb: press, drag up-right, hold. Right thumb: hold SLASH.
  const sx = d.width * 0.2, sy = d.height * 0.7;
  const btn = await page.locator('.tb.big').boundingBox();
  await touch('touchStart', [[sx, sy, 1]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[sx + i * 10, sy - i * 10, 1]]); await page.waitForTimeout(30); }
  await touch('touchStart', [[sx + 60, sy - 60, 1], [btn.x + btn.width / 2, btn.y + btn.height / 2, 2]]);
  await page.waitForTimeout(1500);
  const mid = await page.evaluate(() => { const g = window.__game; return { x: g.player.x, z: g.player.z, swings: g.telemetry.c.swings, touch: g.touch.active, lock: !!g.lock }; });
  await page.screenshot({ path: `tools/out/touch-${name}.png` });
  await touch('touchEnd', []);
  const moved = Math.hypot(mid.x - before.x, mid.z - before.z);
  const ok = mid.touch && moved > 1 && mid.swings > 0 && !errors.length;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(17)} moved ${moved.toFixed(2)}  swings ${mid.swings}  lock ${mid.lock}  ${errors.join(' | ')}`);
  await ctx.close();
}
await browser.close();
close();
process.exit(failed ? 1 : 0);
