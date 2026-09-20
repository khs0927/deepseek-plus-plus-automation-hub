import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_JEV_SHADOW_SETTINGS,
  JEV_SHADOW_SETTINGS_STORAGE_KEY,
  JevShadowSettingsError,
  clearJevShadowTelemetry,
  decodeJevShadowSettings,
  getJevShadowTelemetry,
  runMcpDiscoveryJevShadow,
  saveJevShadowApiKey,
  updateJevShadowSettings,
} from '../core/mcp/jev-shadow';
import type { ToolDescriptor } from '../core/types';

let storage: Record<string, unknown>;
let storageSet: ReturnType<typeof vi.fn>;

beforeEach(() => {
  storage = {};
  storageSet = vi.fn(async (values: Record<string, unknown>) => {
    storage = { ...storage, ...values };
  });
  clearJevShadowTelemetry();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (
          Object.hasOwn(storage, key) ? { [key]: storage[key] } : {}
        )),
        set: storageSet,
        remove: vi.fn(async (key: string) => {
          delete storage[key];
        }),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('JEV MCP discovery shadow router', () => {
  it('is disabled by default and performs no network work', async () => {
    const fetchImpl = vi.fn();

    const observation = await runMcpDiscoveryJevShadow({
      query: 'find GitHub code',
      candidates: [createMcpDescriptor('github', 'search_code')],
      lexicalSelectedIds: ['mcp:github:search_code'],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(observation).toMatchObject({
      status: 'disabled',
      lexicalTopIds: ['mcp:github:search_code'],
      model: DEFAULT_JEV_SHADOW_SETTINGS.model,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
  });

  it('records a semantic ranking without changing the lexical selection', async () => {
    await updateJevShadowSettings({
      enabled: true,
      timeoutMs: 1_000,
      maxCandidates: 8,
    });
    await saveJevShadowApiKey('typesafe-test-key');

    const github = createMcpDescriptor('github', 'search_code');
    const files = createMcpDescriptor('files', 'read_file');
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        state: { intent: string };
        questions: { tool: { type: string; criteria: Record<string, string> } };
      };
      expect(body.state.intent).toBe('read the project file');
      expect(body.questions.tool.type).toBe('choice');
      expect(Object.keys(body.questions.tool.criteria)).toEqual(['c0', 'c1', 'none']);
      return new Response(JSON.stringify({
        model: 'jev-1.13.0',
        answers: {
          tool: {
            type: 'choice',
            choice: 'c1',
            probabilities: { c0: 0.12, c1: 0.83, none: 0.05 },
            confidence: 0.91,
          },
        },
        usage: { input_tokens: 100, output_tokens: 0 },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const observation = await runMcpDiscoveryJevShadow({
      query: 'read the project file',
      candidates: [github, files],
      lexicalSelectedIds: [github.id],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(observation).toMatchObject({
      status: 'ok',
      lexicalTopIds: [github.id],
      semanticTopIds: [files.id, github.id],
      choiceDescriptorId: files.id,
      confidence: 0.91,
      model: 'jev-1.13.0',
    });
    expect(getJevShadowTelemetry()).toEqual([observation]);
    expect(getJevShadowTelemetry()[0]).not.toHaveProperty('query');
  });

  it('contains provider failures inside shadow telemetry', async () => {
    await updateJevShadowSettings({ enabled: true });
    await saveJevShadowApiKey('typesafe-test-key');
    const target = createMcpDescriptor('github', 'search_code');
    const fetchImpl = vi.fn(async () => new Response('rate limited', { status: 429 }));

    await expect(runMcpDiscoveryJevShadow({
      query: 'search',
      candidates: [target],
      lexicalSelectedIds: [target.id],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toMatchObject({
      status: 'error',
      lexicalTopIds: [target.id],
      errorCode: 'http_429',
    });
  });
});

describe('JEV shadow settings storage', () => {
  it('fails closed on future or corrupt settings without rewriting them', async () => {
    storage[JEV_SHADOW_SETTINGS_STORAGE_KEY] = {
      version: 2,
      enabled: true,
      model: 'jev-latest',
      timeoutMs: 1_000,
      maxCandidates: 32,
    };
    const original = structuredClone(storage[JEV_SHADOW_SETTINGS_STORAGE_KEY]);

    await expect(updateJevShadowSettings({ enabled: false }))
      .rejects.toMatchObject({
        name: 'JevShadowSettingsError',
        code: 'jev_shadow_settings_version_unsupported',
      } satisfies Partial<JevShadowSettingsError>);
    expect(storage[JEV_SHADOW_SETTINGS_STORAGE_KEY]).toEqual(original);
    expect(storageSet).not.toHaveBeenCalled();

    expect(() => decodeJevShadowSettings({
      version: 1,
      enabled: true,
      model: '',
      timeoutMs: 1_000,
      maxCandidates: 32,
    })).toThrow(JevShadowSettingsError);
  });
});

function createMcpDescriptor(serverId: string, name: string): ToolDescriptor {
  return {
    id: `mcp:${serverId}:${name}`,
    provider: {
      kind: 'mcp',
      id: serverId,
      displayName: `MCP ${serverId}`,
      transport: 'streamable_http',
    },
    name,
    invocationName: name,
    title: name,
    description: `${name} capability`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execution: { mode: 'auto', enabled: true, risk: 'low' },
  };
}
