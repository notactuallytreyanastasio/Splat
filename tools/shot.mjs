// Screenshot any page of the project headlessly: node tools/shot.mjs <path> <out.png> [waitMs]
import { launch } from './browser.mjs';
import { startServer } from './serve.mjs';

const [, , page = '/', out = 'tools/out/shot.png', wait = '1500'] = process.argv;
const { url, close } = await startServer();
const browser = await launch();
const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
tab.on('pageerror', e => errors.push(e.message));
tab.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await tab.goto(url + page);
await tab.waitForTimeout(+wait);
await tab.screenshot({ path: out });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log('saved', out);
await browser.close();
close();
