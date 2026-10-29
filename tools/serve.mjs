// Starts server.mjs on a free port for headless tools. The server binds port 0 itself and
// prints the port it got: picking a free port here and handing it over raced with other
// tools starting at the same time (two parallel agents ended up testing each other's code).
import { spawn } from 'node:child_process';

export async function startServer() {
  const proc = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: 0 }, stdio: ['ignore', 'pipe', 'inherit'] });
  const line = await new Promise(res => proc.stdout.once('data', d => res(String(d))));
  const url = line.match(/http:\/\/localhost:\d+/)?.[0];
  if (!url) throw new Error('server did not report its port: ' + line);
  return { url, close: () => proc.kill() };
}
