import {
  DECISION_PURPOSES,
  type DecisionPurpose,
} from './contract';
import type { DecisionTraceEntry } from './trace';

export interface DecisionPurposeMetrics {
  purpose: DecisionPurpose;
  total: number;
  applied: number;
  fallback: number;
  appliedRate: number;
  fallbackRate: number;
  averageConfidence: number | null;
  averageLatencyMs: number;
  p95LatencyMs: number;
  averageCandidateCount: number;
  averageSelectionCount: number;
  fallbackReasons: Record<string, number>;
}

export interface DecisionMetricsSummary {
  total: number;
  applied: number;
  fallback: number;
  appliedRate: number;
  fallbackRate: number;
  averageConfidence: number | null;
  averageLatencyMs: number;
  p95LatencyMs: number;
  byPurpose: DecisionPurposeMetrics[];
}

export function summarizeDecisionTraces(
  traces: readonly DecisionTraceEntry[],
): DecisionMetricsSummary {
  const byPurpose = DECISION_PURPOSES.map((purpose) => (
    summarizePurpose(purpose, traces.filter((entry) => entry.purpose === purpose))
  ));
  return summarizeAggregate(traces, byPurpose);
}

function summarizeAggregate(
  traces: readonly DecisionTraceEntry[],
  byPurpose: DecisionPurposeMetrics[],
): DecisionMetricsSummary {
  const total = traces.length;
  const applied = traces.filter((entry) => entry.applied).length;
  const fallback = traces.filter((entry) => Boolean(entry.fallbackReason)).length;
  return {
    total,
    applied,
    fallback,
    appliedRate: ratio(applied, total),
    fallbackRate: ratio(fallback, total),
    averageConfidence: averageDefined(
      traces.map((entry) => entry.confidence),
    ),
    averageLatencyMs: roundMetric(average(
      traces.map((entry) => entry.latencyMs),
    )),
    p95LatencyMs: percentile95(
      traces.map((entry) => entry.latencyMs),
    ),
    byPurpose,
  };
}

function summarizePurpose(
  purpose: DecisionPurpose,
  traces: readonly DecisionTraceEntry[],
): DecisionPurposeMetrics {
  const total = traces.length;
  const applied = traces.filter((entry) => entry.applied).length;
  const fallback = traces.filter((entry) => Boolean(entry.fallbackReason)).length;
  const fallbackReasons: Record<string, number> = {};
  for (const entry of traces) {
    if (!entry.fallbackReason) continue;
    fallbackReasons[entry.fallbackReason] = (
      fallbackReasons[entry.fallbackReason] ?? 0
    ) + 1;
  }

  return {
    purpose,
    total,
    applied,
    fallback,
    appliedRate: ratio(applied, total),
    fallbackRate: ratio(fallback, total),
    averageConfidence: averageDefined(
      traces.map((entry) => entry.confidence),
    ),
    averageLatencyMs: roundMetric(average(
      traces.map((entry) => entry.latencyMs),
    )),
    p95LatencyMs: percentile95(
      traces.map((entry) => entry.latencyMs),
    ),
    averageCandidateCount: roundMetric(average(
      traces.map((entry) => entry.candidateIds.length),
    )),
    averageSelectionCount: roundMetric(average(
      traces.map((entry) => entry.selectedIds.length),
    )),
    fallbackReasons,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : roundMetric(numerator / denominator);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageDefined(
  values: readonly (number | undefined)[],
): number | null {
  const defined = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  return defined.length === 0 ? null : roundMetric(average(defined));
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
  );
  return roundMetric(sorted[index]!);
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}
