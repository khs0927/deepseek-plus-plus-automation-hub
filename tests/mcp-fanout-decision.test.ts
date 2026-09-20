import { afterEach, describe, expect, it } from 'vitest';
import { MockDecisionProvider } from '../core/decision/mock-provider';
import {
  configureDecisionRuntime,
  resetDecisionRuntimeForTests,
} from '../core/decision/provider';
import { selectParallelMcpCallIndexes } from '../core/decision/mcp-fanout';
import { decisionTraceBuffer } from '../core/decision/trace';
import type { ToolCall, ToolDescriptor } from '../core/tool/types';

afterEach(() => {
  resetDecisionRuntimeForTests();
  decisionTraceBuffer.clear();
});

describe('JEV MCP fan-out gate', () => {
  it('keeps deterministic-safe baseline in shadow mode while tracing the suggestion', async () => {
    const descriptors = [
      descriptor('search_docs', true),
      descriptor('get_record', true),
      descriptor('update_record', false, 'medium'),
    ];
    const calls = descriptors.map(callFor);

    configureDecisionRuntime({
      mode: 'shadow',
      provider: new MockDecisionProvider((request) => {
        expect(request.purpose).toBe('mcp_fanout');
        expect(request.candidates).toHaveLength(2);
        expect(request.candidates.map((candidate) => candidate.name)).toEqual([
          'mcp_test_search_docs',
          'mcp_test_get_record',
        ]);
        return {
          provider: 'mock',
          confidence: 0.95,
          selections: [
            { candidateId: request.candidates[0]!.id, confidence: 0.95 },
            { candidateId: request.candidates[1]!.id, confidence: 0.91 },
          ],
        };
      }),
    });

    const selected = await selectParallelMcpCallIndexes({ calls, descriptors });

    expect([...selected]).toEqual([0, 1]);
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      purpose: 'mcp_fanout',
      applied: false,
      confidence: 0.95,
    });
  });

  it('lets active JEV reduce but never expand the deterministic-safe set', async () => {
    const descriptors = [
      descriptor('search_docs', true),
      descriptor('get_record', true),
      descriptor('list_records', true),
      descriptor('delete_record', false, 'high'),
    ];
    const calls = descriptors.map(callFor);

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider((request) => ({
        provider: 'mock',
        confidence: 0.90,
        selections: [
          { candidateId: request.candidates[0]!.id, confidence: 0.94 },
          { candidateId: request.candidates[2]!.id, confidence: 0.90 },
        ],
      })),
    });

    const selected = await selectParallelMcpCallIndexes({ calls, descriptors });

    expect([...selected]).toEqual([0, 2]);
    expect(selected.has(3)).toBe(false);
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      applied: true,
      selectedIds: expect.arrayContaining([
        expect.stringContaining('call:0:'),
        expect.stringContaining('call:2:'),
      ]),
    });
  });

  it('degrades active execution to serial when JEV selects fewer than two calls', async () => {
    const descriptors = [
      descriptor('search_docs', true),
      descriptor('get_record', true),
    ];
    const calls = descriptors.map(callFor);

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider((request) => ({
        provider: 'mock',
        confidence: 0.95,
        selections: [
          { candidateId: request.candidates[0]!.id, confidence: 0.95 },
        ],
      })),
    });

    const selected = await selectParallelMcpCallIndexes({ calls, descriptors });

    expect([...selected]).toEqual([]);
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      fallbackReason: 'no_selection',
      applied: false,
    });
  });

  it('degrades active execution to serial when the provider fails', async () => {
    const descriptors = [
      descriptor('search_docs', true),
      descriptor('get_record', true),
    ];
    const calls = descriptors.map(callFor);

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => {
        throw new Error('provider down');
      }),
    });

    await expect(selectParallelMcpCallIndexes({ calls, descriptors }))
      .resolves.toEqual(new Set<number>());
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      fallbackReason: 'provider_error',
      applied: false,
    });
  });
});

function descriptor(
  name: string,
  readOnly: boolean,
  risk: 'low' | 'medium' | 'high' = 'low',
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
    description: `${name} description`,
    inputSchema: { type: 'object' },
    execution: { mode: 'auto', enabled: true, risk },
    annotations: { readOnlyHint: String(readOnly) },
  };
}

function callFor(descriptor: ToolDescriptor): ToolCall {
  return {
    id: `call:${descriptor.name}`,
    descriptorId: descriptor.id,
    provider: descriptor.provider,
    name: descriptor.name,
    invocationName: descriptor.invocationName,
    payload: { resource: descriptor.name },
    raw: `<${descriptor.invocationName}>{}</${descriptor.invocationName}>`,
    source: { trigger: 'test', requestId: 'fanout-test' },
  };
}
