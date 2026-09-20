import { describe, expect, it, vi } from 'vitest';
import {
  executeBoundedMcpBatch,
  isParallelSafeMcpRead,
  planBoundedMcpBatch,
} from '../core/tool/batch-runtime';
import type { RuntimeToolRuntime } from '../core/tool/runtime';
import type {
  RuntimeToolAuthorizationContext,
  ToolCall,
  ToolDescriptor,
  ToolResult,
} from '../core/tool/types';

describe('bounded MCP fan-out planning', () => {
  it('parallelizes only consecutive read-only calls from distinct MCP providers', async () => {
    const descriptors = [
      descriptor('a', 'read_a', 'read'),
      descriptor('b', 'read_b', 'read'),
      descriptor('c', 'write_c', 'write'),
      descriptor('d', 'read_d', 'read'),
    ];
    const runtime = fakeRuntime(descriptors);

    const plan = await planBoundedMcpBatch(runtime, [
      call(descriptors[0]!, 'call-a'),
      call(descriptors[1]!, 'call-b'),
      call(descriptors[2]!, 'call-c'),
      call(descriptors[3]!, 'call-d'),
    ]);

    expect(plan.waves).toEqual([
      {
        kind: 'parallel_read',
        callIds: ['call-a', 'call-b'],
        providerIds: ['a', 'b'],
      },
      {
        kind: 'serial',
        callIds: ['call-c'],
        providerIds: ['c'],
      },
      {
        kind: 'parallel_read',
        callIds: ['call-d'],
        providerIds: ['d'],
      },
    ]);
  });

  it('never runs two calls from the same MCP provider in one wave', async () => {
    const first = descriptor('shared', 'read_one', 'read');
    const second = descriptor('shared', 'read_two', 'read');
    const runtime = fakeRuntime([first, second]);

    const plan = await planBoundedMcpBatch(runtime, [
      call(first, 'call-1'),
      call(second, 'call-2'),
    ], undefined, 4);

    expect(plan.waves.map((wave) => wave.callIds)).toEqual([
      ['call-1'],
      ['call-2'],
    ]);
  });

  it('accepts MCP readOnlyHint but destructiveHint always wins', () => {
    const hinted = descriptor('a', 'hinted', undefined, { readOnlyHint: 'true' });
    const destructive = descriptor('b', 'destructive', 'read', { destructiveHint: 'true' });
    const local = {
      ...descriptor('c', 'local', 'read'),
      provider: {
        kind: 'local' as const,
        id: 'local',
        displayName: 'Local',
        transport: 'in_process' as const,
      },
    };

    expect(isParallelSafeMcpRead(hinted)).toBe(true);
    expect(isParallelSafeMcpRead(destructive)).toBe(false);
    expect(isParallelSafeMcpRead(local)).toBe(false);
  });
});

describe('bounded MCP fan-out execution', () => {
  it('uses the central runtime for every call and respects the concurrency bound', async () => {
    const descriptors = [
      descriptor('a', 'read_a', 'read'),
      descriptor('b', 'read_b', 'read'),
      descriptor('c', 'read_c', 'read'),
    ];
    let active = 0;
    let maxActive = 0;
    const authorization = grantAuthorization();
    const executeToolCall = vi.fn(async (toolCall: ToolCall, auth: unknown): Promise<ToolResult> => {
      expect(auth).toBe(authorization);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(12);
      active -= 1;
      return okResult(toolCall);
    });
    const runtime = fakeRuntime(descriptors, executeToolCall);

    const outcomes = await executeBoundedMcpBatch({
      runtime,
      calls: descriptors.map((item, index) => call(item, `call-${index + 1}`)),
      authorization,
      maxConcurrency: 2,
    });

    expect(maxActive).toBe(2);
    expect(executeToolCall).toHaveBeenCalledTimes(3);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    expect(outcomes.map((outcome) => outcome.callId)).toEqual([
      'call-1',
      'call-2',
      'call-3',
    ]);
  });

  it('contains one provider exception without cancelling sibling read calls', async () => {
    const first = descriptor('a', 'read_a', 'read');
    const second = descriptor('b', 'read_b', 'read');
    const executeToolCall = vi.fn(async (toolCall: ToolCall): Promise<ToolResult> => {
      if (toolCall.id === 'call-a') throw new Error('provider failed');
      await delay(5);
      return okResult(toolCall);
    });
    const runtime = fakeRuntime([first, second], executeToolCall);

    const outcomes = await executeBoundedMcpBatch({
      runtime,
      calls: [call(first, 'call-a'), call(second, 'call-b')],
      authorization: grantAuthorization(),
    });

    expect(outcomes[0]).toEqual({
      callId: 'call-a',
      status: 'rejected',
      error: { name: 'Error', message: 'provider failed' },
    });
    expect(outcomes[1]).toMatchObject({
      callId: 'call-b',
      status: 'fulfilled',
      result: { ok: true },
    });
    expect(executeToolCall).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate or missing call ids before any execution starts', async () => {
    const target = descriptor('a', 'read_a', 'read');
    const executeToolCall = vi.fn(async (toolCall: ToolCall) => okResult(toolCall));
    const runtime = fakeRuntime([target], executeToolCall);

    await expect(executeBoundedMcpBatch({
      runtime,
      calls: [call(target, 'same'), call(target, 'same')],
      authorization: grantAuthorization(),
    })).rejects.toThrow('Duplicate MCP batch call id');

    await expect(executeBoundedMcpBatch({
      runtime,
      calls: [{ ...call(target, 'temporary'), id: undefined }],
      authorization: grantAuthorization(),
    })).rejects.toThrow('stable call id');

    expect(executeToolCall).not.toHaveBeenCalled();
  });
});

function descriptor(
  providerId: string,
  name: string,
  operation?: string,
  annotations: Record<string, string> = {},
): ToolDescriptor {
  return {
    id: `mcp:${providerId}:${name}`,
    provider: {
      kind: 'mcp',
      id: providerId,
      displayName: `MCP ${providerId}`,
      transport: 'streamable_http',
    },
    name,
    invocationName: `${providerId}__${name}`,
    title: name,
    description: `${name} description`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execution: { mode: 'auto', enabled: true, risk: 'low' },
    annotations: {
      ...(operation ? { operation } : {}),
      ...annotations,
    },
  };
}

function call(descriptor: ToolDescriptor, id: string): ToolCall {
  return {
    id,
    descriptorId: descriptor.id,
    provider: descriptor.provider,
    name: descriptor.name,
    invocationName: descriptor.invocationName,
    payload: {},
    raw: `<tool_call name="${descriptor.invocationName}" />`,
  };
}

function fakeRuntime(
  descriptors: ToolDescriptor[],
  executeToolCall: RuntimeToolRuntime['executeToolCall'] = async (toolCall) => okResult(toolCall),
): RuntimeToolRuntime {
  return {
    getToolDescriptors: async () => descriptors,
    getAuthorizationDescriptors: async () => descriptors,
    refreshToolDescriptors: async () => descriptors,
    executeToolCall,
  };
}

function grantAuthorization(): RuntimeToolAuthorizationContext {
  return {
    kind: 'grant',
    grantId: 'grant-1',
    subject: {
      surface: 'deepseek_content',
      documentSessionId: 'document-1',
      tabId: 1,
      frameId: 0,
      chatSessionId: 'chat-1',
    },
  };
}

function okResult(toolCall: ToolCall): ToolResult {
  return {
    ok: true,
    summary: 'ok',
    callId: toolCall.id,
    descriptorId: toolCall.descriptorId,
    provider: toolCall.provider,
    name: toolCall.name,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
