import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { platform } from 'node:os';
import { attachProcessToJobObject, terminateProcessTree } from '../packages/shell-host/native/process-lifecycle.mjs';

if (platform() !== 'win32') {
  console.log('SKIP windows-job-object-smoke: Windows only');
  process.exit(0);
}

const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
  stdio: 'ignore',
  windowsHide: true,
});

try {
  const attached = await attachProcessToJobObject(child);
  if (!attached.attached || !attached.guaranteed || attached.method !== 'windows-job-object') {
    throw new Error(`Job Object attachment was not guaranteed: ${JSON.stringify(attached)}`);
  }

  const terminated = await terminateProcessTree(child, { reason: 'windows_job_object_smoke' });
  if (!terminated.guaranteed || terminated.method !== 'windows-job-object') {
    throw new Error(`Job Object termination was not guaranteed: ${JSON.stringify(terminated)}`);
  }

  await Promise.race([
    once(child, 'close'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Child did not exit after Job Object close.')), 8_000)),
  ]);
  console.log('PASS windows-job-object-smoke: attachment and kill-on-close verified');
} finally {
  if (!child.killed && child.exitCode === null) {
    try { child.kill(); } catch { /* already closed */ }
  }
}
