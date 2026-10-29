// Starts server.mjs on a free port for headless tools.
import { spawn } from 'node:child_process';
import net from 'node:net';

export async function startServer() {
  const port = await new Promise(res => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
  const proc = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(res => proc.stdout.once('data', res));
  return { url: `http://localhost:${port}`, close: () => proc.kill() };
}
