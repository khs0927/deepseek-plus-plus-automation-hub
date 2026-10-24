#!/usr/bin/env node
// Read-only benchmark. Run on the actual Windows target; do not generalize
// timings from CI or Linux to PowerShell or AutoCAD workloads.
import { platform } from 'node:os';
import { createProcessToolHandlers } from '../packages/shell-host/native/process-provider.mjs';
import { createDirectProcessHandler } from '../packages/shell-host/native/direct-process-provider.mjs';
import { createBatchToolHandlers } from '../packages/shell-host/native/batch-provider.mjs';

const shell = createProcessToolHandlers().find(entry => entry.name === 'shell_exec').handle;
const direct = createDirectProcessHandler();
const [shellBatch, processBatch] = createBatchToolHandlers({ shellHandler: shell, directHandler: direct }).map(entry => entry.handle);
const executable = process.execPath;
const shellCommand = platform() === 'win32'
  ? "& '" + executable.replaceAll("'", "''") + "' --version"
  : "'" + executable.replaceAll("'", "'\\''") + "' --version";
const directJob = { file: executable, args: ['--version'] };
const shellJob = { command: shellCommand };
const count = Math.max(4, Math.min(30, Number(process.argv[2]) || 8));

async function measure(label, times, action) {
  const durations = [];
  for (let index = 0; index < times; index += 1) {
    const start = process.hrtime.bigint();
    const outcome = await action();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (outcome?.structuredContent?.ok !== true) {
      throw new Error(label + ' failed; inspect the host before claiming speed.');
    }
    durations.push(ms);
  }
  const sorted = durations.slice().sort((a, b) => a - b);
  const percentile = p => Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)].toFixed(2));
  return { label, runs: times, p50_ms: percentile(.5), p95_ms: percentile(.95), min_ms: percentile(0), max_ms: percentile(1) };
}

await shell(shellJob); // Both paths get a warmup; neither creates persistent state.
await direct(directJob);
const results = [];
results.push(await measure('shell_exec (PowerShell on Windows)', count, () => shell(shellJob)));
results.push(await measure('direct spawn argv (no shell)', count, () => direct(directJob)));
results.push(await measure('shell_batch (4 independent)', 3, () => shellBatch({ parallel: true, concurrency: 4, jobs: Array.from({ length: 4 }, () => shellJob) })));
results.push(await measure('process_batch (4 independent)', 3, () => processBatch({ parallel: true, concurrency: 4, jobs: Array.from({ length: 4 }, () => directJob) })));
console.log(JSON.stringify({ platform: platform(), node: process.version, results }, null, 2));
