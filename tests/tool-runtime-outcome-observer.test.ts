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
  ToolResult,
} from '../core/tool/types';

describe('runtime tool outcome observer', () => {
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

  it('never replaces the provider result when the observer fails', async () => {
    const providerIdentity: ToolProviderIdentity = {
      kind: 'local',
      id: 'observer-test',
      displayName: 'Observer Test',
      transport: 'in_process',
    };
    const descriptor: ToolDescriptor = {
      id: 'local:observer-test:read',
      provider: providerIdentity,
      name: 'observer_test_read',
      invocationName: 'observer_test_read',
      title: 'Observer test read',
      description: 'Returns a stable result for observer testing.',
      inputSchema: { type: 'object' },
      execution: { mode: 'auto', enabled: true, risk: 'low' },
    };
    const providerResult: ToolResult = {
      ok: true,
      summary: 'provider result survives',
      detail: 'stable',
    };
    const runtimeProvider: RuntimeToolProvider = {
      registration: { kind: 'local', id: providerIdentity.id },
      listTools: async () => [descriptor],
      execute: vi.fn(async () => providerResult),
    };
    const observer = {
      observe: vi.fn(async () => {
        throw new Error('observer unavailable');
      }),
    };
    const runtime = createRuntimeToolRuntime(
      new ToolProviderRegistry([runtimeProvider]),
      { outcomeObserver: observer },
    );
    const call: ToolCall = {
      id: 'observer-call',
      descriptorId: descriptor.id,
      provider: providerIdentity,
      name: descriptor.name,
      invocationName: descriptor.invocationName,
      payload: {},
      raw: '<observer_test_read>{}</observer_test_read>',
      source: { trigger: 'test', requestId: 'observer-request' },
    };

    const result = await runtime.executeToolCall(call, 'test', 'en');

    expect(result).toEqual(providerResult);
    expect(observer.observe).toHaveBeenCalledWith({
      call,
      descriptor,
      result: providerResult,
      signal: undefined,
    });
  });
});
