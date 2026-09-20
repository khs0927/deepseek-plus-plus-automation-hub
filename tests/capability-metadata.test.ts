import { describe, expect, it } from 'vitest';
import { readCapabilityMetadata } from '../core/tool/capability-metadata';
import type { ToolDescriptor } from '../core/tool/types';

describe('capability metadata', () => {
  it('parses explicit dpp metadata without exposing unrelated annotations', () => {
    const metadata = readCapabilityMetadata(descriptor({
      'dpp.effect': 'compute',
      'dpp.idempotent': 'true',
      'dpp.parallelSafe': 'true',
      'dpp.requiresApproval': 'false',
      'dpp.resources': JSON.stringify(['gpu:0', 'workspace:alpha']),
      'dpp.resourceLocks': 'gpu:0, workspace:alpha',
      'dpp.dependencies': JSON.stringify(['mcp:test:prepare']),
      'dpp.dataSensitivity': 'internal',
      secret: 'do-not-copy',
    }));

    expect(metadata).toEqual({
      effect: 'compute',
      idempotent: true,
      parallelSafe: true,
      requiresApproval: false,
      resources: ['gpu:0', 'workspace:alpha'],
      resourceLocks: ['gpu:0', 'workspace:alpha'],
      dependencies: ['mcp:test:prepare'],
      dataSensitivity: 'internal',
    });
    expect(JSON.stringify(metadata)).not.toContain('do-not-copy');
  });

  it('falls back to standard idempotentHint while keeping malformed values non-authoritative', () => {
    const metadata = readCapabilityMetadata(descriptor({
      idempotentHint: 'true',
      'dpp.parallelSafe': 'definitely',
      'dpp.resources': '{broken-json',
      'dpp.effect': 'unknown',
    }));

    expect(metadata.idempotent).toBe(true);
    expect(metadata.parallelSafe).toBeNull();
    expect(metadata.effect).toBeNull();
    expect(metadata.resources).toEqual(['{broken-json']);
  });

  it('deduplicates and bounds list metadata', () => {
    const metadata = readCapabilityMetadata(descriptor({
      'dpp.resourceLocks': 'alpha, beta, alpha,  beta ',
    }));
    expect(metadata.resourceLocks).toEqual(['alpha', 'beta']);
  });
});

function descriptor(
  annotations: Record<string, string>,
): ToolDescriptor {
  return {
    id: 'mcp:test:metadata',
    provider: {
      kind: 'mcp',
      id: 'test',
      displayName: 'Test MCP',
      transport: 'streamable_http',
    },
    name: 'metadata',
    invocationName: 'mcp_test_metadata',
    title: 'Metadata test',
    description: 'Metadata test descriptor.',
    inputSchema: { type: 'object' },
    execution: {
      mode: 'auto',
      enabled: true,
      risk: 'low',
    },
    annotations,
  };
}
