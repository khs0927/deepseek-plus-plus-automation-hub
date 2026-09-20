import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  SubagentOrchestrator,
} = require('../integrations/deepseek-pp-custom/subagent-mcp/orchestrator.js');

function createHarness(maxConcurrent = 2) {
  const started: string[] = [];
  const gates: Array<(value: { output: string; engine: string }) => void> = [];

  const worker = vi.fn(({ task }: { task: string }) => {
    started.push(task);
    return new Promise<{ output: string; engine: string }>((resolve) => {
      gates.push(resolve);
    });
  });

  const orchestrator = new SubagentOrchestrator({
    workerRunners: {
      deepseek_web: worker,
      gemini: worker,
      groq: worker,
    },
  });

  orchestrator.config = {
    ...orchestrator.config,
    defaultEngine: 'deepseek_web',
    geminiApiKey: '',
    groqApiKey: '',
    maxConcurrentSubagents: maxConcurrent,
  };

  return { orchestrator, started, gates, worker };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('SubagentOrchestrator bounded concurrency', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs at most maxConcurrentSubagents and drains queued work', async () => {
    const { orchestrator, started, gates } = createHarness(2);

    const receipts = await Promise.all([
      orchestrator.invokeSubagent({ role: 'A', task: 'task-a', background: true }),
      orchestrator.invokeSubagent({ role: 'B', task: 'task-b', background: true }),
      orchestrator.invokeSubagent({ role: 'C', task: 'task-c', background: true }),
      orchestrator.invokeSubagent({ role: 'D', task: 'task-d', background: true }),
    ]);

    expect(started).toEqual(['task-a', 'task-b']);
    expect(orchestrator.getStats()).toMatchObject({
      active: 2,
      queued: 2,
      maxConcurrent: 2,
    });
    expect(receipts[2].status).toBe('QUEUED');

    gates[0]({ output: 'done-a', engine: 'deepseek_web' });
    await flush();

    expect(started).toEqual(['task-a', 'task-b', 'task-c']);
    expect(orchestrator.getStats()).toMatchObject({
      active: 2,
      queued: 1,
    });

    gates[1]({ output: 'done-b', engine: 'deepseek_web' });
    await flush();
    expect(started).toEqual(['task-a', 'task-b', 'task-c', 'task-d']);

    gates[2]({ output: 'done-c', engine: 'deepseek_web' });
    gates[3]({ output: 'done-d', engine: 'deepseek_web' });
    await Promise.all(receipts.map((receipt: { taskId: string }) => orchestrator.waitForSubagent(receipt.taskId)));

    expect(orchestrator.getStats()).toMatchObject({
      active: 0,
      queued: 0,
    });
  });

  it('cancels queued work without starting its worker', async () => {
    const { orchestrator, started, gates } = createHarness(1);

    const first = await orchestrator.invokeSubagent({
      role: 'First',
      task: 'first',
      background: true,
    });
    const second = await orchestrator.invokeSubagent({
      role: 'Second',
      task: 'second',
      background: true,
    });

    expect(started).toEqual(['first']);
    expect(orchestrator.checkStatus(second.taskId)).toMatchObject({
      status: 'QUEUED',
      queuePosition: 1,
    });

    expect(orchestrator.killSubagent(second.taskId)).toMatchObject({ ok: true });
    expect(orchestrator.checkStatus(second.taskId)).toMatchObject({
      status: 'CANCELLED',
    });

    gates[0]({ output: 'done', engine: 'deepseek_web' });
    await orchestrator.waitForSubagent(first.taskId);
    await flush();

    expect(started).toEqual(['first']);
    expect(orchestrator.getStats()).toMatchObject({
      active: 0,
      queued: 0,
    });
  });

  it('routes batch fan-out through the same bounded scheduler', async () => {
    const { orchestrator, started, gates } = createHarness(2);

    const batchPromise = orchestrator.invokeSubagentBatch({
      background: false,
      tasks: [
        { role: 'One', task: 'one', engine: 'deepseek_web' },
        { role: 'Two', task: 'two', engine: 'deepseek_web' },
        { role: 'Three', task: 'three', engine: 'deepseek_web' },
      ],
    });

    await flush();
    expect(started).toEqual(['one', 'two']);

    gates[0]({ output: '1', engine: 'deepseek_web' });
    await flush();
    expect(started).toEqual(['one', 'two', 'three']);

    gates[1]({ output: '2', engine: 'deepseek_web' });
    gates[2]({ output: '3', engine: 'deepseek_web' });

    const batch = await batchPromise;
    expect(batch.taskIds).toHaveLength(3);
    expect(batch.tasks.map((task: { status: string }) => task.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
    ]);
  });
});
