// Launch headless Chromium. Uses the newest cached Playwright headless shell when the
// pinned Playwright's own revision is not downloaded (avoids a 100MB fetch per machine).
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function launch() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try { return await chromium.launch({ args }); } catch {}
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) {
    const sub = fs.readdirSync(path.join(cache, d)).find(s => s.startsWith('chrome-headless-shell'));
    const exe = sub && path.join(cache, d, sub, 'chrome-headless-shell');
    if (exe && fs.existsSync(exe)) return chromium.launch({ args, executablePath: exe });
  }
  throw new Error('no chromium available: run npx playwright install chromium-headless-shell');
}
