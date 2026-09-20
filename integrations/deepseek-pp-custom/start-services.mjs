import net from 'net';
import fs from 'fs';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'subagent-mcp', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const port = Number(config.port) || 8932;
const cdpUrl = config.cdpUrl || 'http://127.0.0.1:9223';
const cdpPort = Number(new URL(cdpUrl).port) || 9223;

function checkPort(targetPort, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(targetPort, host);
  });
}

async function main() {
  console.log('DeepSeek++ Custom service checks');
  const registerScript = path.join(__dirname, 'native-host', 'register-host.mjs');
  const registration = spawnSync(process.execPath, [registerScript], { stdio: 'inherit', windowsHide: true });
  if (registration.status !== 0) console.error('Native Host registration returned a non-zero status.');

  if (await checkPort(cdpPort)) {
    console.log(`Edge CDP detected on ${cdpPort}.`);
  } else {
    console.log(`Edge CDP is not listening on ${cdpPort}; browser-dependent tools remain unavailable.`);
  }

  if (await checkPort(port)) {
    console.log(`Subagent MCP is already listening on ${port}.`);
    return;
  }

  const serverPath = path.join(__dirname, 'subagent-mcp', 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: 'ignore',
    cwd: path.join(__dirname, 'subagent-mcp'),
    windowsHide: true,
    env: { ...process.env },
  });
  child.unref();
  await new Promise(resolve => setTimeout(resolve, 1_500));
  console.log(await checkPort(port) ? `Subagent MCP started on ${port}.` : `Subagent MCP did not open ${port} yet.`);
}

main().catch(error => {
  console.error('Service check failed:', error.message);
  process.exitCode = 1;
});
