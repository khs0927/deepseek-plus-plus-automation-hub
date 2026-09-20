import { afterEach, describe, expect, it } from 'vitest';
import {
  configureDecisionRuntime,
  resetDecisionRuntimeForTests,
} from '../core/decision/provider';
import { MockDecisionProvider } from '../core/decision/mock-provider';
import { decisionTraceBuffer } from '../core/decision/trace';
import { createMcpCapabilityToolDescriptors } from '../core/mcp/capability-tools';
import {
  projectMcpCapabilityDescriptorsWithDecision,
} from '../core/mcp/capability-decision';
import type { McpCapabilitySettings } from '../core/mcp/capability-types';
import type { ToolDescriptor } from '../core/tool/types';

afterEach(() => {
  resetDecisionRuntimeForTests();
  decisionTraceBuffer.clear();
});

describe('MCP capability decision projection', () => {
  it('keeps the lexical projection in shadow mode while recording the suggestion', async () => {
    const alpha = createMcpDescriptor('server-1', 'alpha_search', 'Search project documents.');
    const beta = createMcpDescriptor('server-1', 'beta_write', 'Write a project document.');
    const helpers = createMcpCapabilityToolDescriptors('en');

    configureDecisionRuntime({
      mode: 'shadow',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        confidence: 0.99,
        selections: [
          { candidateId: beta.id, confidence: 0.99 },
          { candidateId: alpha.id, confidence: 0.80 },
        ],
      })),
    });

    const projection = await projectMcpCapabilityDescriptorsWithDecision({
      descriptors: [alpha, beta, ...helpers],
      settings: createAdaptiveSettings(),
      intent: 'search project documents',
    });

    expect(projection.directDescriptorIds).toEqual([alpha.id]);
    expect(decisionTraceBuffer.list()).toMatchObject([
      {
        mode: 'shadow',
        selectedIds: [beta.id, alpha.id],
        applied: false,
      },
    ]);
  });

  it('applies a high-confidence provider order only in active mode', async () => {
    const alpha = createMcpDescriptor('server-1', 'alpha_search', 'Search project documents.');
    const beta = createMcpDescriptor('server-1', 'beta_write', 'Write a project document.');
    const helpers = createMcpCapabilityToolDescriptors('en');

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        model: 'jev-test',
        confidence: 0.95,
        selections: [
          { candidateId: beta.id, confidence: 0.95 },
          { candidateId: alpha.id, confidence: 0.80 },
        ],
      })),
    });

    const projection = await projectMcpCapabilityDescriptorsWithDecision({
      descriptors: [alpha, beta, ...helpers],
      settings: createAdaptiveSettings(),
      intent: 'search project documents',
    });

    expect(projection.directDescriptorIds).toEqual([beta.id]);
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      model: 'jev-test',
      applied: true,
    });
  });

  it('falls back when confidence is below the policy threshold', async () => {
    const alpha = createMcpDescriptor('server-1', 'alpha_search', 'Search project documents.');
    const beta = createMcpDescriptor('server-1', 'beta_write', 'Write a project document.');
    const helpers = createMcpCapabilityToolDescriptors('en');

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        confidence: 0.50,
        selections: [{ candidateId: beta.id, confidence: 0.50 }],
      })),
    });

    const projection = await projectMcpCapabilityDescriptorsWithDecision({
      descriptors: [alpha, beta, ...helpers],
      settings: createAdaptiveSettings(),
      intent: 'search project documents',
    });

    expect(projection.directDescriptorIds).toEqual([alpha.id]);
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      fallbackReason: 'low_confidence',
      applied: false,
    });
  });

  it('redacts common secrets before sending intent to an external decision provider', async () => {
    const alpha = createMcpDescriptor('server-1', 'alpha_search', 'Search project documents.');
    const beta = createMcpDescriptor('server-1', 'beta_write', 'Write a project document.');
    const helpers = createMcpCapabilityToolDescriptors('en');

    configureDecisionRuntime({
      mode: 'shadow',
      provider: new MockDecisionProvider((request) => {
        expect(request.intent).not.toContain('super-secret-value');
        expect(request.intent).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
        expect(request.intent).toContain('password=[REDACTED]');
        expect(request.intent).toContain('[REDACTED_GITHUB_TOKEN]');
        return {
          provider: 'mock',
          confidence: 0.90,
          selections: [{ candidateId: alpha.id, confidence: 0.90 }],
        };
      }),
    });

    await projectMcpCapabilityDescriptorsWithDecision({
      descriptors: [alpha, beta, ...helpers],
      settings: createAdaptiveSettings(),
      intent: 'search docs password=super-secret-value repository credential ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
    });
  });

  it('uses an ephemeral adaptive overlay for the known Subagent Manager only in active mode', async () => {
    const batch = createMcpDescriptor(
      'subagent-manager',
      'invoke_subagent_batch',
      'Spawn multiple independent subagents.',
    );
    const list = createMcpDescriptor(
      'subagent-manager',
      'list_subagents',
      'List current subagents.',
    );
    batch.provider = { ...batch.provider, displayName: 'Subagent Manager' };
    list.provider = { ...list.provider, displayName: 'Subagent Manager' };
    const helpers = createMcpCapabilityToolDescriptors('en');
    const settings: McpCapabilitySettings = {
      version: 1,
      adaptiveMaxDirectTools: 1,
      adaptiveMaxPromptBytes: 24_000,
      servers: {},
    };

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        confidence: 0.99,
        selections: [
          { candidateId: batch.id, confidence: 0.99 },
          { candidateId: list.id, confidence: 0.20 },
        ],
      })),
    });

    const activeProjection = await projectMcpCapabilityDescriptorsWithDecision({
      descriptors: [list, batch, ...helpers],
      settings,
      intent: 'run specialist agents in parallel',
    });

    expect(activeProjection.directDescriptorIds).toEqual([batch.id]);
    expect(activeProjection.hiddenDescriptorIds).toEqual([list.id]);
    expect(settings.servers).toEqual({});

    configureDecisionRuntime({
      mode: 'shadow',
      provider: new MockDecisionProvider(() => {
        throw new Error('shadow should not auto-convert a direct server to adaptive');
      }),
    });

    const shadowProjection = await projectMcpCapabilityDescriptorsWithDecision({
      descriptors: [list, batch, ...helpers],
      settings,
      intent: 'run specialist agents in parallel',
    });

    expect(shadowProjection.directDescriptorIds).toEqual([list.id, batch.id]);
    expect(shadowProjection.hiddenDescriptorIds).toEqual([]);
    expect(shadowProjection.usesCatalog).toBe(false);
  });

  it('can route an adaptive Subagent Manager batch tool through the JEV decision layer', async () => {
    const subagent = createMcpDescriptor(
      'subagent-manager',
      'invoke_subagent_batch',
      'Spawn multiple independent subagents with bounded parallel fan-out.',
    );
    const search = createMcpDescriptor(
      'search-server',
      'search_docs',
      'Search project documentation.',
    );
    const helpers = createMcpCapabilityToolDescriptors('en');

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        confidence: 0.97,
        selections: [
          { candidateId: subagent.id, confidence: 0.97 },
          { candidateId: search.id, confidence: 0.42 },
        ],
      })),
    });

    const settings: McpCapabilitySettings = {
      version: 1,
      adaptiveMaxDirectTools: 1,
      adaptiveMaxPromptBytes: 24_000,
      servers: {
        'subagent-manager': { mode: 'adaptive', pinnedDescriptorIds: [] },
        'search-server': { mode: 'adaptive', pinnedDescriptorIds: [] },
      },
    };

    const projection = await projectMcpCapabilityDescriptorsWithDecision({
      descriptors: [search, subagent, ...helpers],
      settings,
      intent: 'split this coding task across multiple specialist agents in parallel',
    });

    expect(projection.directDescriptorIds).toEqual([subagent.id]);
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      selectedIds: [subagent.id, search.id],
      applied: true,
    });
  });

  it('never lets a semantic provider demote an explicit pin', async () => {
    const alpha = createMcpDescriptor('server-1', 'alpha_search', 'Search project documents.');
    const beta = createMcpDescriptor('server-1', 'beta_write', 'Write a project document.');
    const helpers = createMcpCapabilityToolDescriptors('en');

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        confidence: 0.99,
        selections: [
          { candidateId: beta.id, confidence: 0.99 },
          { candidateId: alpha.id, confidence: 0.80 },
        ],
      })),
    });

    const settings = createAdaptiveSettings();
    settings.servers['server-1'].pinnedDescriptorIds = [alpha.id];

    const projection = await projectMcpCapabilityDescriptorsWithDecision({
      descriptors: [alpha, beta, ...helpers],
      settings,
      intent: 'write a project document',
    });

    expect(projection.directDescriptorIds).toEqual([alpha.id]);
  });
});

function createAdaptiveSettings(): McpCapabilitySettings {
  return {
    version: 1,
    adaptiveMaxDirectTools: 1,
    adaptiveMaxPromptBytes: 24_000,
    servers: {
      'server-1': {
        mode: 'adaptive',
        pinnedDescriptorIds: [],
      },
    },
  };
}

function createMcpDescriptor(
  serverId: string,
  name: string,
  description: string,
): ToolDescriptor {
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
    description,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execution: {
      mode: 'auto',
      enabled: true,
      risk: 'low',
    },
  };
}
