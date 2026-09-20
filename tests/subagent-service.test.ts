import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { SubagentOrchestrator } = require('../integrations/deepseek-subagent-mcp/orchestrator.js') as any;
const {
  WatchdogDaemon,
} = require('../integrations/deepseek-subagent-mcp/watchdog-daemon.js') as any;
const {
  createSseClientRegistry,
  isAllowedOrigin,
  isLoopbackAddress,
  readRequestBody,
} = require('../integrations/deepseek-subagent-mcp/server.js') as any;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('canonical subagent service', () => {
  it('keeps worker concurrency at five and queues the remainder', async () => {
    let active = 0;
    let maximum = 0;
    const runner = ({ signal }: { signal: AbortSignal }) => new Promise<{ output: string; engine: string }>((resolve, reject) => {
      active += 1;
      maximum = Math.max(maximum, active);
      const timer = setTimeout(() => {
        active -= 1;
        resolve({ output: 'done', engine: 'fake' });
      }, 15);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        active -= 1;
        reject(signal.reason || new Error('aborted'));
      }, { once: true });
    });
    const orchestrator = new SubagentOrchestrator({
      runners: { deepseek_web: runner, gemini: runner, groq: runner },
    });

    const accepted = await Promise.all(Array.from({ length: 6 }, (_, index) => orchestrator.invokeSubagent({
      role: `role-${index}`,
      task: `task-${index}`,
      background: true,
      engine: 'deepseek_web',
    })));
    expect(accepted.some((item: any) => item.status === 'QUEUED')).toBe(true);
    await wait(80);
    expect(maximum).toBeLessThanOrEqual(5);
    expect(orchestrator.listSubagents().every((item: any) => item.status === 'COMPLETED')).toBe(true);
  });

  it('aborts a running worker and never overwrites CANCELLED with FAILED or COMPLETED', async () => {
    const runner = ({ signal }: { signal: AbortSignal }) => new Promise<{ output: string; engine: string }>((resolve, reject) => {
      const timer = setTimeout(() => resolve({ output: 'late result', engine: 'fake' }), 40);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason || new Error('aborted'));
      }, { once: true });
    });
    const orchestrator = new SubagentOrchestrator({ runners: { deepseek_web: runner, gemini: runner, groq: runner } });
    const accepted = await orchestrator.invokeSubagent({ role: 'cancel', task: 'cancel me', background: true, engine: 'deepseek_web' });
    expect(orchestrator.killSubagent(accepted.taskId).ok).toBe(true);
    await wait(60);
    expect(orchestrator.checkStatus(accepted.taskId).status).toBe('CANCELLED');
  });

  it('skips overlapping watchdog ticks', async () => {
    const daemon = new WatchdogDaemon({ intervalMs: 60_000 });
    daemon.keeper = { scanSessions: vi.fn(() => wait(20).then(() => [])) };
    const first = daemon.tick();
    const second = daemon.tick();
    await Promise.all([first, second]);
    expect(daemon.getStatus().stats.checksTotal).toBe(1);
    expect(daemon.getStatus().stats.checksSkippedOverlap).toBe(1);
  });

  it('routes SSE responses to one client and accepts only loopback origins by default', () => {
    const registry = createSseClientRegistry();
    const first = { write: vi.fn() };
    const second = { write: vi.fn() };
    registry.add('first', first);
    registry.add('second', second);
    expect(registry.send('first', { id: 1 })).toBe(true);
    expect(first.write).toHaveBeenCalledTimes(1);
    expect(second.write).not.toHaveBeenCalled();
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.0.2.1')).toBe(false);
    expect(isAllowedOrigin('http://127.0.0.1:8932')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
  });

  it('rejects oversized JSON-RPC request bodies before parsing', async () => {
    const request = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn> };
    request.destroy = vi.fn();
    const body = readRequestBody(request, 4);
    request.emit('data', Buffer.from('12345'));
    await expect(body).rejects.toMatchObject({ code: 'request_body_too_large' });
    expect(request.destroy).toHaveBeenCalledTimes(1);
  });
});
