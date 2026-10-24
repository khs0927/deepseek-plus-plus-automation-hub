import { describe, it, expect } from 'vitest';
// @ts-ignore - native host modules use .mjs
import { createBatchToolHandlers } from '../packages/shell-host/native/batch-provider.mjs';

function tool(handler: (args: any, context?: any) => any) {
  return createBatchToolHandlers({ shellHandler: handler })[0].handle;
}
const success = ({ command }: { command: string }) => ({
  structuredContent: { ok: true, data: { exitCode: 0, stdout: command, stderr: '' } },
});

describe('DeepSeek++ Custom high-speed shell batch', () => {
  it('preserves sequential input/output ordering', async () => {
    const order: string[] = [];
    const handle = tool(async ({ command }: any) => {
      order.push(command);
      return success({ command });
    });
    const result = await handle({ jobs: [{ command: 'one' }, { command: 'two' }] });
    expect(order).toEqual(['one', 'two']);
    expect(result.structuredContent).toMatchObject({
      ok: true, data: { total: 2, succeeded: 2, failed: 0, mode: 'sequential', concurrency: 1 },
    });
  });

  it('runs independent commands concurrently with a strict cap', async () => {
    let active = 0;
    let peak = 0;
    const handle = tool(async ({ command }: any) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 8));
      active -= 1;
      return success({ command });
    });
    const result = await handle({
      parallel: true, concurrency: 2,
      jobs: Array.from({ length: 6 }, (_, index) => ({ command: String(index) })),
    });
    expect(peak).toBe(2);
    expect(result.structuredContent.data.jobs.map((job: any) => job.stdout))
      .toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('stops after first failure in sequential mode', async () => {
    const calls: string[] = [];
    const handle = tool(async ({ command }: any) => {
      calls.push(command);
      if (command === 'bad') return {
        isError: true, structuredContent: { ok: false, data: { exitCode: 8, stderr: 'failure' } },
      };
      return success({ command });
    });
    const result = await handle({ stop_on_error: true, jobs: [
      { command: 'good' }, { command: 'bad' }, { command: 'skipped' },
    ] });
    expect(calls).toEqual(['good', 'bad']);
    expect(result.structuredContent.data).toMatchObject({ succeeded: 1, failed: 1, skipped: 1 });
    expect(result.isError).toBe(true);
  });

  it('rejects oversized, empty and ambiguous parallel stop-on-error batches', async () => {
    const handle = tool(async () => { throw Error('must not execute'); });
    for (const args of [
      { jobs: [] },
      { jobs: Array.from({ length: 13 }, () => ({ command: 'echo ok' })) },
      { jobs: [{ command: ' ' }] },
      { parallel: true, stop_on_error: true, jobs: [{ command: 'echo ok' }] },
    ]) {
      const result = await handle(args);
      expect(result.isError).toBe(true);
    }
  });

  it('handles per-command exceptions without losing later results', async () => {
    const handle = tool(async ({ command }: any) => {
      if (command === 'bad') throw Error('spawn failed');
      return success({ command });
    });
    const result = await handle({ jobs: [{ command: 'bad' }, { command: 'good' }] });
    expect(result.structuredContent.data).toMatchObject({ failed: 1, succeeded: 1 });
    expect(result.structuredContent.data.jobs[0].stderr).toContain('spawn failed');
  });
});
