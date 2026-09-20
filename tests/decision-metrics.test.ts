import { describe, expect, it } from 'vitest';
import { summarizeDecisionTraces } from '../core/decision/metrics';
import type { DecisionTraceEntry } from '../core/decision/trace';

describe('decision metrics', () => {
  it('aggregates applied, fallback, confidence, latency, and purpose metrics', () => {
    const traces: DecisionTraceEntry[] = [
      trace({
        purpose: 'mcp_rank',
        applied: true,
        confidence: 0.9,
        latencyMs: 100,
        candidateIds: ['a', 'b'],
        selectedIds: ['a'],
      }),
      trace({
        purpose: 'mcp_rank',
        applied: false,
        confidence: 0.6,
        latencyMs: 200,
        candidateIds: ['a', 'b', 'c'],
        selectedIds: [],
        fallbackReason: 'low_confidence',
      }),
      trace({
        purpose: 'result_judge',
        applied: false,
        confidence: 0.95,
        latencyMs: 50,
        candidateIds: ['accept', 'retry', 'escalate'],
        selectedIds: ['accept'],
      }),
    ];

    const summary = summarizeDecisionTraces(traces);

    expect(summary).toMatchObject({
      total: 3,
      applied: 1,
      fallback: 1,
      appliedRate: 0.333,
      fallbackRate: 0.333,
      averageConfidence: 0.817,
      averageLatencyMs: 116.667,
      p95LatencyMs: 200,
    });

    const mcp = summary.byPurpose.find((entry) => entry.purpose === 'mcp_rank');
    expect(mcp).toMatchObject({
      total: 2,
      applied: 1,
      fallback: 1,
      appliedRate: 0.5,
      fallbackRate: 0.5,
      averageConfidence: 0.75,
      averageLatencyMs: 150,
      p95LatencyMs: 200,
      averageCandidateCount: 2.5,
      averageSelectionCount: 0.5,
      fallbackReasons: {
        low_confidence: 1,
      },
    });
  });

  it('returns stable zero metrics for empty trace buffers', () => {
    const summary = summarizeDecisionTraces([]);

    expect(summary).toMatchObject({
      total: 0,
      applied: 0,
      fallback: 0,
      appliedRate: 0,
      fallbackRate: 0,
      averageConfidence: null,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
    });
    expect(summary.byPurpose).toHaveLength(6);
    expect(summary.byPurpose.every((entry) => (
      entry.total === 0 &&
      entry.averageConfidence === null &&
      entry.averageLatencyMs === 0
    ))).toBe(true);
  });

  it('counts fallback reasons independently by purpose', () => {
    const summary = summarizeDecisionTraces([
      trace({
        purpose: 'mcp_fanout',
        fallbackReason: 'provider_error',
      }),
      trace({
        purpose: 'mcp_fanout',
        fallbackReason: 'provider_error',
      }),
      trace({
        purpose: 'mcp_fanout',
        fallbackReason: 'no_selection',
      }),
      trace({
        purpose: 'skill_rank',
        fallbackReason: 'low_confidence',
      }),
    ]);

    expect(summary.byPurpose.find((entry) => entry.purpose === 'mcp_fanout')
      ?.fallbackReasons).toEqual({
      provider_error: 2,
      no_selection: 1,
    });
    expect(summary.byPurpose.find((entry) => entry.purpose === 'skill_rank')
      ?.fallbackReasons).toEqual({
      low_confidence: 1,
    });
  });
});

function trace(
  overrides: Partial<DecisionTraceEntry> &
    Pick<DecisionTraceEntry, 'purpose'>,
): DecisionTraceEntry {
  return {
    requestId: crypto.randomUUID(),
    purpose: overrides.purpose,
    mode: 'active',
    provider: 'mock',
    model: 'test-model',
    candidateIds: [],
    selectedIds: [],
    confidence: undefined,
    threshold: 0.8,
    latencyMs: 10,
    applied: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}
