// Static dev server + level save API. No build step: the browser loads ES modules directly.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5177);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const levelDir = path.join(root, 'game/levels');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/levels' && req.method === 'GET') {
      const names = (await fs.readdir(levelDir)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
      return send(res, 200, JSON.stringify(names), '.json');
    }
    const m = url.pathname.match(/^\/api\/levels\/([\w-]+)$/);
    if (m && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      JSON.parse(body); // refuse garbage before it hits disk
      await fs.writeFile(path.join(levelDir, m[1] + '.json'), body);
      return send(res, 200, '{"ok":true}', '.json');
    }
    let p = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!p.startsWith(root)) return send(res, 403, 'no');
    if ((await fs.stat(p).catch(() => null))?.isDirectory()) p = path.join(p, 'index.html');
    send(res, 200, await fs.readFile(p), path.extname(p));
  } catch (e) {
    send(res, e.code === 'ENOENT' ? 404 : 500, String(e.message));
  }
});

function send(res, code, body, ext = '.txt') {
  res.writeHead(code, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
}

server.listen(port, () => console.log(`http://localhost:${server.address().port}/  (editor: /editor.html)`));
