import type { ToolDescriptor } from '../tool/types';
import type {
  DecisionEffect,
  DecisionRiskLevel,
  DecisionScore,
} from './types';

/**
 * Authoritative decision policy.
 *
 * The provider/model never decides when to act: it returns scores and the
 * runtime applies these thresholds. There is deliberately no single global
 * confidence threshold. A read-only search may auto-proceed at a low score
 * while a write or external side effect requires a much higher one, and an
 * external side effect never auto-approves on Jev confidence alone.
 */
export interface DecisionThresholdContext {
  effect: DecisionEffect;
  riskLevel: DecisionRiskLevel;
}

const BASE_THRESHOLDS: Record<DecisionEffect, number> = {
  read: 0.35,
  compute: 0.5,
  write: 0.75,
  external_side_effect: 1.01,
};

const RISK_BUMP: Record<DecisionRiskLevel, number> = {
  low: 0,
  medium: 0.05,
  high: 0.12,
  critical: 0.25,
};

/**
 * Resolve the auto-proceed threshold for a candidate. `external_side_effect`
 * intentionally resolves above 1.0 so it can never auto-proceed on model
 * confidence alone; it requires an explicit human/authorization step.
 */
export function resolveDecisionThreshold(context: DecisionThresholdContext): number {
  const base = BASE_THRESHOLDS[context.effect];
  return Math.min(1.01, base + RISK_BUMP[context.riskLevel]);
}

/**
 * Map a tool descriptor onto the decision effect/risk vocabulary. Kept next to
 * the policy so the mapping and the thresholds evolve together.
 */
export function classifyDescriptor(
  descriptor: Pick<ToolDescriptor, 'execution' | 'name' | 'invocationName'>,
): DecisionThresholdContext {
  const risk = descriptor.execution.risk;
  const riskLevel: DecisionRiskLevel = risk === 'high'
    ? 'high'
    : risk === 'medium'
      ? 'medium'
      : 'low';
  const haystack = `${descriptor.name} ${descriptor.invocationName}`.toLowerCase();
  const effect: DecisionEffect = /(^|_)(write|create|update|delete|remove|push|commit|submit|publish|send|post|upload|move|rename)(_|$)/.test(haystack)
    ? 'write'
    : 'read';
  return { effect, riskLevel };
}

/**
 * Split scored candidates into accepted/rejected using an explicit threshold.
 * Ordering is preserved by score (desc) with a stable id tie-break so the
 * result is deterministic for a fixed score set.
 */
export interface DecisionAcceptOptions {
  threshold: number;
  maxSelections: number;
  /** Pinned ids are always accepted and exempt from the threshold. */
  pinnedIds?: ReadonlySet<string>;
}

export interface DecisionAcceptResult {
  acceptedIds: string[];
  rejectedIds: string[];
}

export function applyDecisionThreshold(
  scores: readonly DecisionScore[],
  options: DecisionAcceptOptions,
): DecisionAcceptResult {
  const pinned = options.pinnedIds ?? new Set<string>();
  const ordered = [...scores].sort((left, right) => (
    right.confidence - left.confidence ||
    (left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0)
  ));
  const acceptedIds: string[] = [];
  const rejectedIds: string[] = [];
  for (const entry of ordered) {
    if (pinned.has(entry.candidateId)) {
      acceptedIds.push(entry.candidateId);
      continue;
    }
    if (acceptedIds.length >= options.maxSelections) {
      rejectedIds.push(entry.candidateId);
      continue;
    }
    if (entry.confidence >= options.threshold) {
      acceptedIds.push(entry.candidateId);
    } else {
      rejectedIds.push(entry.candidateId);
    }
  }
  return { acceptedIds, rejectedIds };
}
