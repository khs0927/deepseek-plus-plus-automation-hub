import { afterEach, describe, expect, it } from 'vitest';
import { MockDecisionProvider } from '../core/decision/mock-provider';
import {
  configureDecisionRuntime,
  resetDecisionRuntimeForTests,
} from '../core/decision/provider';
import { judgeToolOutcome } from '../core/decision/result-judge';
import { decisionTraceBuffer } from '../core/decision/trace';
import type { ToolCall, ToolDescriptor, ToolResult } from '../core/tool/types';

afterEach(() => {
  resetDecisionRuntimeForTests();
  decisionTraceBuffer.clear();
});

describe('JEV result judge', () => {
  it('returns a high-confidence advisory accept verdict without mutating the tool result', async () => {
    const result = createToolResult();
    const snapshot = JSON.stringify(result);

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider((request) => {
        expect(request.purpose).toBe('result_judge');
        expect(request.candidates.map((candidate) => candidate.id)).toEqual([
          'accept',
          'retry',
          'escalate',
        ]);
        return {
          provider: 'mock',
          model: 'jev-test',
          confidence: 0.96,
          selections: [{ candidateId: 'accept', confidence: 0.96 }],
        };
      }),
    });

    const verdict = await judgeToolOutcome({
      call: createToolCall(),
      descriptor: createDescriptor(),
      result,
    });

    expect(verdict).toEqual({
      action: 'accept',
      confidence: 0.96,
      provider: 'mock',
      model: 'jev-test',
      advisory: true,
      fallback: false,
    });
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      purpose: 'result_judge',
      selectedIds: ['accept'],
      applied: false,
    });
  });

  it('fails safe to advisory escalation on low confidence', async () => {
    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        confidence: 0.42,
        selections: [{ candidateId: 'retry', confidence: 0.42 }],
      })),
    });

    const verdict = await judgeToolOutcome({
      call: createToolCall(),
      descriptor: createDescriptor(),
      result: {
        ok: false,
        summary: 'temporary upstream error',
        error: {
          code: 'upstream_timeout',
          message: 'timeout',
          retryable: true,
        },
      },
    });

    expect(verdict).toMatchObject({
      action: 'escalate',
      fallback: true,
      confidence: 0.42,
    });
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      fallbackReason: 'low_confidence',
    });
  });

  it('redacts credentials from result evidence before provider evaluation', async () => {
    configureDecisionRuntime({
      mode: 'shadow',
      provider: new MockDecisionProvider((request) => {
        expect(request.intent).not.toContain('super-secret-value');
        expect(request.intent).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456');
        expect(request.intent).toContain('password=[REDACTED]');
        expect(request.intent).toContain('[REDACTED_GITHUB_TOKEN]');
        return {
          provider: 'mock',
          confidence: 0.91,
          selections: [{ candidateId: 'escalate', confidence: 0.91 }],
        };
      }),
    });

    await judgeToolOutcome({
      call: createToolCall(),
      descriptor: createDescriptor(),
      result: {
        ok: true,
        summary: 'password=super-secret-value repository credential ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
      },
    });
  });

  it('returns null when the decision runtime is disabled', async () => {
    configureDecisionRuntime({ mode: 'disabled', provider: null });

    await expect(judgeToolOutcome({
      call: createToolCall(),
      descriptor: createDescriptor(),
      result: createToolResult(),
    })).resolves.toBeNull();

    expect(decisionTraceBuffer.list()).toEqual([]);
  });
});

function createDescriptor(): ToolDescriptor {
  return {
    id: 'mcp:test:read',
    provider: {
      kind: 'mcp',
      id: 'test',
      displayName: 'Test MCP',
      transport: 'streamable_http',
    },
    name: 'read',
    invocationName: 'mcp_test_read',
    title: 'Read evidence',
    description: 'Read external evidence.',
    inputSchema: { type: 'object' },
    execution: {
      mode: 'auto',
      enabled: true,
      risk: 'low',
    },
  };
}

function createToolCall(): ToolCall {
  return {
    id: 'call-1',
    descriptorId: 'mcp:test:read',
    provider: createDescriptor().provider,
    name: 'read',
    invocationName: 'mcp_test_read',
    payload: {},
    raw: '<mcp_test_read>{}</mcp_test_read>',
    source: { trigger: 'test', requestId: 'req-1' },
  };
}

function createToolResult(): ToolResult {
  return {
    ok: true,
    summary: 'evidence loaded',
    detail: 'The provider returned the requested record.',
    truncated: false,
  };
}
