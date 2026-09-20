import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ToolProviderRegistry,
  type RuntimeToolProvider,
} from '../core/tool/provider-registry';
import { createRuntimeToolRuntime } from '../core/tool/runtime';
import type {
  ToolCall,
  ToolDescriptor,
  ToolProviderIdentity,
} from '../core/tool/types';

describe('pre-authorization runtime payload transformer', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('accepts only transformed payload and preserves call/provider identity', async () => {
    const providerIdentity: ToolProviderIdentity = {
      kind: 'local',
      id: 'transform-test',
      displayName: 'Transform Test',
      transport: 'in_process',
    };
    const descriptor: ToolDescriptor = {
      id: 'local:transform-test:run',
      provider: providerIdentity,
      name: 'transform_test_run',
      invocationName: 'transform_test_run',
      title: 'Transform test',
      description: 'Tests payload-only transforms.',
      inputSchema: { type: 'object' },
      execution: { mode: 'auto', enabled: true, risk: 'low' },
    };
    const execute = vi.fn(async (call: ToolCall) => ({
      ok: true,
      summary: String((call.payload as Record<string, unknown>).engine),
    }));
    const runtimeProvider: RuntimeToolProvider = {
      registration: { kind: 'local', id: providerIdentity.id },
      listTools: async () => [descriptor],
      execute,
    };
    const transformer = {
      transform: vi.fn(async ({ call }: { call: ToolCall }) => ({
        ...call,
        name: 'malicious_rename',
        invocationName: 'malicious_rename',
        provider: {
          ...call.provider!,
          id: 'other-provider',
        },
        source: { trigger: 'other', requestId: 'other' } as unknown as ToolCall['source'],
        payload: { ...call.payload as Record<string, unknown>, engine: 'gemini' },
      })),
    };
    const runtime = createRuntimeToolRuntime(
      new ToolProviderRegistry([runtimeProvider]),
      { preAuthorizationTransformer: transformer },
    );
    const call: ToolCall = {
      id: 'transform-call',
      descriptorId: descriptor.id,
      provider: providerIdentity,
      name: descriptor.name,
      invocationName: descriptor.invocationName,
      payload: { engine: 'auto' },
      raw: '<transform_test_run>{}</transform_test_run>',
      source: { trigger: 'test', requestId: 'transform-request' },
    };

    const result = await runtime.executeToolCall(call, 'test', 'en');

    expect(result.ok).toBe(true);
    expect(result.summary).toBe('gemini');
    expect(execute).toHaveBeenCalledTimes(1);
    const executedCall = execute.mock.calls[0]![0] as ToolCall;
    expect(executedCall.name).toBe(call.name);
    expect(executedCall.invocationName).toBe(call.invocationName);
    expect(executedCall.provider).toEqual(providerIdentity);
    expect(executedCall.source).toMatchObject({
      trigger: 'test',
      requestId: 'transform-request',
    });
    expect(executedCall.payload).toEqual({ engine: 'gemini' });
  });

  it('fails open to the original payload when the transformer throws', async () => {
    const providerIdentity: ToolProviderIdentity = {
      kind: 'local',
      id: 'transform-fallback',
      displayName: 'Transform Fallback',
      transport: 'in_process',
    };
    const descriptor: ToolDescriptor = {
      id: 'local:transform-fallback:run',
      provider: providerIdentity,
      name: 'transform_fallback_run',
      invocationName: 'transform_fallback_run',
      title: 'Transform fallback',
      description: 'Tests transformer fallback.',
      inputSchema: { type: 'object' },
      execution: { mode: 'auto', enabled: true, risk: 'low' },
    };
    const execute = vi.fn(async (call: ToolCall) => ({
      ok: true,
      summary: String((call.payload as Record<string, unknown>).engine),
    }));
    const runtime = createRuntimeToolRuntime(
      new ToolProviderRegistry([{
        registration: { kind: 'local', id: providerIdentity.id },
        listTools: async () => [descriptor],
        execute,
      }]),
      {
        preAuthorizationTransformer: {
          transform: async () => {
            throw new Error('decision provider unavailable');
          },
        },
      },
    );
    const call: ToolCall = {
      id: 'fallback-call',
      descriptorId: descriptor.id,
      provider: providerIdentity,
      name: descriptor.name,
      invocationName: descriptor.invocationName,
      payload: { engine: 'auto' },
      raw: '<transform_fallback_run>{}</transform_fallback_run>',
      source: { trigger: 'test', requestId: 'fallback-request' },
    };

    const result = await runtime.executeToolCall(call, 'test', 'en');
    expect(result.summary).toBe('auto');
  });
});
