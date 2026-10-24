import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
// @ts-ignore - Native Host executable modules are .mjs.
import { createDirectProcessHandler } from '../packages/shell-host/native/direct-process-provider.mjs';
// @ts-ignore - Native Host executable modules are .mjs.
import { createBatchToolHandlers } from '../packages/shell-host/native/batch-provider.mjs';

const direct = createDirectProcessHandler();
const handlers = createBatchToolHandlers({
  shellHandler: async () => { throw new Error('shell fallback must not execute'); },
  directHandler: direct,
});
const batch = handlers.find((entry: { name: string }) => entry.name === 'process_batch').handle;

describe('DeepSeek++ Custom direct-process fast path', () => {
  it('passes arguments literally rather than expanding shell metacharacters', async () => {
    const result = await batch({
      jobs: [{ file: process.execPath, args: [
        '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))',
        'literal;$(printf injected)',
      ] }],
    });
    expect(result.structuredContent.ok).toBe(true);
    expect(result.structuredContent.data.jobs[0].stdout).toBe('["literal;$(printf injected)"]');
  });

  it('reports nonexistent executables rather than a fake success', async () => {
    const response = await direct({ file: 'does-not-exist-deepseek-custom-test-948272', args: [] });
    expect(response.structuredContent.ok).toBe(false);
    expect(response.isError).toBe(true);
  });

  it('fails closed on invalid argv and pre-aborted requests', async () => {
    expect((await direct({ file: process.execPath, args: [null] })).isError).toBe(true);
    const controller = new AbortController();
    controller.abort();
    const result = await direct({ file: process.execPath, args: ['-v'] }, { signal: controller.signal });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.data.cancelled).toBe(true);
  });

  it('terminates a long-running child after its timeout', async () => {
    const result = await direct({
      file: process.execPath, args: ['-e', 'setTimeout(()=>{},10000)'], timeout_ms: 1000,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent.data.timedOut).toBe(true);
  });

  it('limits a 12-job Unicode batch to less than one native message frame', async () => {
    const oversizedOutput = '한글🚀'.repeat(30000);
    const mocked = createBatchToolHandlers({
      shellHandler: async () => ({
        structuredContent: { ok: true, data: {
          exitCode: 0, stdout: oversizedOutput, stderr: oversizedOutput,
        } },
      }),
    })[0].handle;
    const result = await mocked({ parallel: true, jobs: Array.from({ length: 12 }, () => ({ command: 'noop' })) });
    expect(result.structuredContent.data.jobs[0].stdoutTruncated).toBe(true);
    expect(result.structuredContent.data.jobs[0].stderrTruncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(1024 * 1024);
  });

  it('returns a SHA-256 digest of complete output even when the preview is truncated', async () => {
    const output = '한글🚀'.repeat(30000);
    const result = await direct({
      file: process.execPath,
      args: ['-e', 'process.stdout.write("한글🚀".repeat(30000))'],
    });
    expect(result.structuredContent.ok).toBe(true);
    expect(result.structuredContent.data.truncated).toBe(true);
    expect(result.structuredContent.data.stdoutBytes).toBe(Buffer.byteLength(output, 'utf8'));
    expect(result.structuredContent.data.stdoutSha256)
      .toBe(createHash('sha256').update(output).digest('hex'));
    expect(Buffer.byteLength(result.structuredContent.data.stdout, 'utf8')).toBeLessThanOrEqual(65536);
  });

  it('does not run shell commands in direct mode', async () => {
    const result = await batch({ jobs: [{ file: process.execPath, args: [
      '-e', 'process.stdout.write("direct-ok")',
    ] }] });
    expect(result.structuredContent.data.jobs[0].stdout).toBe('direct-ok');
  });
});
