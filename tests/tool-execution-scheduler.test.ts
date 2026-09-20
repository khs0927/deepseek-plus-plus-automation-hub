import { describe, expect, it } from 'vitest';
import { createToolExecutionScheduler, ToolSchedulerError } from '../core/tool/scheduler';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe('tool execution scheduler', () => {
  it('allows independent reads but serializes writes on the same resource', async () => {
    const scheduler = createToolExecutionScheduler({ maxWaitMs: 500 });
    let reads = 0;
    let writes = 0;
    let peakReads = 0;
    const read = () => scheduler.schedule({
      ownerKey: 'chat:a', serverKey: 'mcp:files', lane: 'known-safe',
      resources: [{ key: 'path:x', mode: 'read' }],
      run: async () => { reads++; peakReads = Math.max(peakReads, reads); await wait(15); reads--; return 'read'; },
    });
    await Promise.all([read(), read()]);
    expect(peakReads).toBe(2);

    const write = () => scheduler.schedule({
      ownerKey: 'chat:a', serverKey: 'mcp:files', lane: 'default',
      resources: [{ key: 'path:x', mode: 'write' }],
      run: async () => { writes++; expect(writes).toBe(1); await wait(10); writes--; return 'write'; },
    });
    await Promise.all([write(), write()]);
    expect(writes).toBe(0);
  });

  it('enforces owner queue bounds and propagates queued cancellation', async () => {
    const scheduler = createToolExecutionScheduler({ ownerQueueLimit: 1, totalQueueLimit: 2, maxWaitMs: 50 });
    let release!: () => void;
    const held = scheduler.schedule({ ownerKey: 'a', serverKey: 's', run: () => new Promise(resolve => { release = () => resolve('held'); }) });
    const controller = new AbortController();
    const queued = scheduler.schedule({ ownerKey: 'a', serverKey: 's', signal: controller.signal, run: async () => 'queued' });
    const overflow = scheduler.schedule({ ownerKey: 'a', serverKey: 's', run: async () => 'overflow' });
    await expect(overflow).rejects.toBeInstanceOf(ToolSchedulerError);
    controller.abort(new Error('cancelled'));
    await expect(queued).rejects.toThrow('cancelled');
    release();
    await held;
  });
});
