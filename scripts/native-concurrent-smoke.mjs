import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const host = resolve('packages/shell-host/native/shell-mcp-host.mjs');
const child = spawn(process.execPath, [host], { stdio: ['pipe', 'pipe', 'pipe'] });
const envelopes = [
  {
    protocol: 'deepseek-pp-mcp-native', version: 1, server: { id: 'concurrent-smoke' },
    message: { jsonrpc: '2.0', id: 'slow', method: 'tools/call', params: { name: 'shell_exec', arguments: { command: process.platform === 'win32' ? 'Start-Sleep -Milliseconds 1200' : 'sleep 1.2', timeout_ms: 3_000 } } },
  },
  {
    protocol: 'deepseek-pp-mcp-native', version: 1, server: { id: 'concurrent-smoke' },
    message: { jsonrpc: '2.0', id: 'tools', method: 'tools/list' },
  },
];

let stdout = Buffer.alloc(0);
let stderr = '';
const responses = [];
const timeout = setTimeout(() => {
  child.kill();
  throw new Error(`Concurrent native smoke timed out. stderr=${stderr}`);
}, 10_000);
child.stderr.on('data', chunk => { stderr += String(chunk); });
child.stdout.on('data', chunk => {
  stdout = Buffer.concat([stdout, chunk]);
  while (stdout.length >= 4) {
    const length = stdout.readUInt32LE(0);
    if (stdout.length < length + 4) return;
    responses.push(JSON.parse(stdout.subarray(4, length + 4).toString('utf8')));
    stdout = stdout.subarray(length + 4);
  }
});
for (const envelope of envelopes) {
  const body = Buffer.from(JSON.stringify(envelope), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  child.stdin.write(Buffer.concat([header, body]));
}
await new Promise((resolvePromise, reject) => {
  const check = () => responses.length === envelopes.length ? resolvePromise() : undefined;
  child.stdout.on('data', check);
  child.once('error', reject);
});
clearTimeout(timeout);
child.kill();
const ids = responses.map(response => response.id);
if (ids.join(',') !== 'tools,slow') throw new Error(`Unexpected response order: ${ids.join(',')}`);
console.log(`PASS native-concurrent-smoke: ${ids.join(',')}`);
