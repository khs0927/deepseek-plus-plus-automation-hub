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
      dagFallbackCount: 0,
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

  it('parallelizes explicitly safe idempotent compute MCP tools', () => {
    const computeA = descriptor('vectorize', {
      'dpp.effect': 'compute',
      'dpp.parallelSafe': 'true',
      'dpp.idempotent': 'true',
    });
    const computeB = descriptor('embed', {
      'dpp.effect': 'compute',
      'dpp.parallelSafe': 'true',
      'dpp.idempotent': 'true',
    });

    expect(isParallelSafeMcpDescriptor(computeA)).toBe(true);
    expect(planToolCallExecution(
      [callFor(computeA), callFor(computeB)],
      [computeA, computeB],
      4,
    ).batches).toEqual([
      { mode: 'parallel', callIndexes: [0, 1] },
    ]);
  });

  it('keeps compute tools serial unless parallelSafe and idempotent are explicit', () => {
    const compute = descriptor('vectorize', {
      'dpp.effect': 'compute',
      'dpp.parallelSafe': 'true',
      'dpp.idempotent': 'false',
    });
    expect(isParallelSafeMcpDescriptor(compute)).toBe(false);
  });

  it('orders declared safe dependencies as deterministic DAG layers', () => {
    const prepare = descriptor('prepare', { readOnlyHint: 'true' });
    const independent = descriptor('independent', { readOnlyHint: 'true' });
    const analyze = descriptor('analyze', {
      readOnlyHint: 'true',
      'dpp.dependencies': JSON.stringify([prepare.id]),
    });
    const summarize = descriptor('summarize', {
      readOnlyHint: 'true',
      'dpp.dependencies': JSON.stringify([analyze.invocationName]),
    });

    expect(isParallelSafeMcpDescriptor(analyze)).toBe(true);
    const plan = planToolCallExecution(
      [callFor(prepare), callFor(independent), callFor(analyze), callFor(summarize)],
      [prepare, independent, analyze, summarize],
      4,
    );

    expect(plan.batches).toEqual([
      { mode: 'parallel', callIndexes: [0, 1] },
      { mode: 'serial', callIndexes: [2] },
      { mode: 'serial', callIndexes: [3] },
    ]);
    expect(plan.dagFallbackCount).toBe(0);
  });

  it('falls back an unresolved dependency segment to original-order serial execution', () => {
    const first = descriptor('first', { readOnlyHint: 'true' });
    const dependent = descriptor('dependent', {
      readOnlyHint: 'true',
      'dpp.dependencies': JSON.stringify(['mcp:test:missing']),
    });

    const plan = planToolCallExecution(
      [callFor(first), callFor(dependent)],
      [first, dependent],
      4,
    );

    expect(plan.batches).toEqual([
      { mode: 'serial', callIndexes: [0] },
      { mode: 'serial', callIndexes: [1] },
    ]);
    expect(plan.dagFallbackCount).toBe(1);
  });

  it('falls back cyclic dependencies to original-order serial execution', () => {
    const left = descriptor('left', { readOnlyHint: 'true' });
    const right = descriptor('right', { readOnlyHint: 'true' });
    left.annotations = {
      ...left.annotations,
      'dpp.dependencies': JSON.stringify([right.id]),
    };
    right.annotations = {
      ...right.annotations,
      'dpp.dependencies': JSON.stringify([left.id]),
    };

    const plan = planToolCallExecution(
      [callFor(left), callFor(right)],
      [left, right],
      4,
    );

    expect(plan.batches).toEqual([
      { mode: 'serial', callIndexes: [0] },
      { mode: 'serial', callIndexes: [1] },
    ]);
    expect(plan.dagFallbackCount).toBe(1);
  });

  it('splits otherwise-safe calls that share a resource lock', () => {
    const first = descriptor('read_a', {
      readOnlyHint: 'true',
      'dpp.resourceLocks': JSON.stringify(['workspace:alpha']),
    });
    const second = descriptor('read_b', {
      readOnlyHint: 'true',
      'dpp.resourceLocks': JSON.stringify(['workspace:alpha']),
    });
    const third = descriptor('read_c', {
      readOnlyHint: 'true',
      'dpp.resourceLocks': JSON.stringify(['workspace:beta']),
    });

    expect(planToolCallExecution(
      [callFor(first), callFor(second), callFor(third)],
      [first, second, third],
      4,
    ).batches).toEqual([
      { mode: 'serial', callIndexes: [0] },
      { mode: 'parallel', callIndexes: [1, 2] },
    ]);
  });

  it('combines DAG layers with resource-lock conflict splitting', () => {
    const rootA = descriptor('root_a', {
      readOnlyHint: 'true',
      'dpp.resourceLocks': JSON.stringify(['workspace:a']),
    });
    const rootB = descriptor('root_b', {
      readOnlyHint: 'true',
      'dpp.resourceLocks': JSON.stringify(['workspace:a']),
    });
    const child = descriptor('child', {
      readOnlyHint: 'true',
      'dpp.dependencies': JSON.stringify([rootA.id]),
    });

    const plan = planToolCallExecution(
      [callFor(rootA), callFor(rootB), callFor(child)],
      [rootA, rootB, child],
      4,
    );

    expect(plan.batches).toEqual([
      { mode: 'serial', callIndexes: [0] },
      { mode: 'serial', callIndexes: [1] },
      { mode: 'serial', callIndexes: [2] },
    ]);
    expect(plan.dagFallbackCount).toBe(0);
  });

  it('never parallelizes explicit write or external side-effect metadata', () => {
    const write = descriptor('read_like_name', {
      readOnlyHint: 'true',
      'dpp.effect': 'write',
      'dpp.parallelSafe': 'true',
      'dpp.idempotent': 'true',
    });
    const external = descriptor('status_external', {
      readOnlyHint: 'true',
      'dpp.effect': 'external_side_effect',
      'dpp.parallelSafe': 'true',
      'dpp.idempotent': 'true',
    });

    expect(isParallelSafeMcpDescriptor(write)).toBe(false);
    expect(isParallelSafeMcpDescriptor(external)).toBe(false);
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
