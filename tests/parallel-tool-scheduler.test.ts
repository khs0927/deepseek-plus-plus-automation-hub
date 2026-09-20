import { describe, expect, it, vi } from 'vitest';
import {
  executeToolCallsWithPlan,
  isParallelSafeMcpDescriptor,
  planToolCallExecution,
} from '../core/tool/parallel-scheduler';
import type { ToolCall, ToolDescriptor } from '../core/tool/types';

describe('parallel MCP tool scheduler', () => {
  it('parallelizes consecutive low-risk read-only MCP calls', () => {
    const descriptors = [
      descriptor('search_docs', { readOnlyHint: 'true' }),
      descriptor('get_record', { readOnlyHint: 'true' }),
      descriptor('status_job', { readOnlyHint: 'true' }),
    ];
    const calls = descriptors.map(callFor);

    expect(planToolCallExecution(calls, descriptors, 4)).toEqual({
      batches: [{ mode: 'parallel', callIndexes: [0, 1, 2] }],
      parallelCallCount: 3,
      serialCallCount: 0,
      maxConcurrency: 4,
    });
  });

  it('preserves serial boundaries around mutation-capable calls', () => {
    const readA = descriptor('search_docs', { readOnlyHint: 'true' });
    const write = descriptor('update_record', { readOnlyHint: 'false' });
    write.execution.risk = 'medium';
    const readB = descriptor('get_record', { readOnlyHint: 'true' });
    const readC = descriptor('list_records', { readOnlyHint: 'true' });

    const descriptors = [readA, write, readB, readC];
    const calls = descriptors.map(callFor);
    const plan = planToolCallExecution(calls, descriptors, 4);

    expect(plan.batches).toEqual([
      { mode: 'serial', callIndexes: [0] },
      { mode: 'serial', callIndexes: [1] },
      { mode: 'parallel', callIndexes: [2, 3] },
    ]);
    expect(plan.parallelCallCount).toBe(2);
    expect(plan.serialCallCount).toBe(2);
  });

  it('never trusts a destructive hint even when risk is low', () => {
    const item = descriptor('get_and_delete', {
      readOnlyHint: 'true',
      destructiveHint: 'true',
    });
    expect(isParallelSafeMcpDescriptor(item)).toBe(false);
  });

  it('supports a conservative read-name fallback only for low-risk MCP tools', () => {
    expect(isParallelSafeMcpDescriptor(descriptor('search_docs'))).toBe(true);

    const mutation = descriptor('update_record');
    expect(isParallelSafeMcpDescriptor(mutation)).toBe(false);

    const local = descriptor('search_docs');
    local.provider = { ...local.provider, kind: 'local', transport: 'in_process' };
    expect(isParallelSafeMcpDescriptor(local)).toBe(false);
  });

  it('preserves input result order while executing a safe batch concurrently', async () => {
    const descriptors = [
      descriptor('read_a', { readOnlyHint: 'true' }),
      descriptor('read_b', { readOnlyHint: 'true' }),
      descriptor('read_c', { readOnlyHint: 'true' }),
    ];
    const calls = descriptors.map(callFor);
    const starts: string[] = [];
    const resolvers = new Map<string, (value: string) => void>();

    const operation = executeToolCallsWithPlan({
      calls,
      descriptors,
      execute: vi.fn((call) => {
        starts.push(call.name);
        return new Promise<string>((resolve) => {
          resolvers.set(call.name, resolve);
        });
      }),
    });

    await Promise.resolve();
    expect(starts).toEqual(['read_a', 'read_b', 'read_c']);

    resolvers.get('read_c')?.('C');
    resolvers.get('read_a')?.('A');
    resolvers.get('read_b')?.('B');

    await expect(operation).resolves.toEqual(['A', 'B', 'C']);
  });

  it('chunks safe calls at the configured concurrency limit', () => {
    const descriptors = Array.from({ length: 5 }, (_, index) => (
      descriptor(`read_${index}`, { readOnlyHint: 'true' })
    ));
    const calls = descriptors.map(callFor);

    expect(planToolCallExecution(calls, descriptors, 2).batches).toEqual([
      { mode: 'parallel', callIndexes: [0, 1] },
      { mode: 'parallel', callIndexes: [2, 3] },
      { mode: 'serial', callIndexes: [4] },
    ]);
  });
});

function descriptor(
  name: string,
  annotations: Record<string, string> = {},
): ToolDescriptor {
  return {
    id: `mcp:test:${name}`,
    provider: {
      kind: 'mcp',
      id: 'test',
      displayName: 'Test MCP',
      transport: 'streamable_http',
    },
    name,
    invocationName: `mcp_test_${name}`,
    title: name,
    description: name,
    inputSchema: { type: 'object' },
    execution: {
      mode: 'auto',
      enabled: true,
      risk: 'low',
    },
    annotations,
  };
}

function callFor(descriptor: ToolDescriptor): ToolCall {
  return {
    id: `call:${descriptor.name}`,
    descriptorId: descriptor.id,
    provider: descriptor.provider,
    name: descriptor.name,
    invocationName: descriptor.invocationName,
    payload: {},
    raw: `<${descriptor.invocationName}>{}</${descriptor.invocationName}>`,
    source: { trigger: 'test', requestId: 'parallel-test' },
  };
}
