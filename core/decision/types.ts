// JEV Decision Plane - shared contracts.
//
// Design rules (see docs/jev-decision-plane.md):
//   Decision  != Authorization
//   Decision  != Execution
//   Decision  != Verification
//
// The decision plane only ever answers narrow, typed questions about a shared
// state (relevance / ranking / primary / judge). It never grants permission,
// never executes a capability and never asserts external truth. Runtime code
// always owns authorization, scheduling, execution and outcome verification.

export const DECISION_KINDS = [
  'capability_relevance',
  'capability_primary',
  'result_judge',
  'retry_judge',
] as const;

export type DecisionKind = typeof DECISION_KINDS[number];

// Reused vocabulary for policy thresholds. 'critical' is intentionally
// separate from tool risk so the decision policy can tighten a threshold
// without touching the tool descriptor contract.
export const DECISION_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export type DecisionRiskLevel = typeof DECISION_RISK_LEVELS[number];

export const DECISION_EFFECTS = [
  'read',
  'compute',
  'write',
  'external_side_effect',
] as const;

export type DecisionEffect = typeof DECISION_EFFECTS[number];

export interface DecisionCandidate {
  /** Stable candidate id (descriptor id, skill id, subagent id, ...). */
  id: string;
  /** Human/model-readable label rendered inside the prompt. */
  label: string;
  /** Optional short description; keep it bounded, never dump a full schema. */
  description?: string;
}

/**
 * A single narrow question against the shared state. Jev is designed for
 * N questions over one state rather than one giant generation, so the caller
 * fans out narrow questions instead of asking "pick everything".
 */
export interface DecisionQuestion {
  id: string;
  prompt: string;
  kind: DecisionKind;
}

/**
 * A policy hint travels with the request so the provider can render an
 * appropriate prompt. The hint is advisory only: the authoritative threshold
 * lives in core/decision/policy.ts and is applied by runtime code, never by
 * the provider or the model.
 */
export interface DecisionPolicyHint {
  minConfidence?: number;
  maxSelections?: number;
  requiresPrimary?: boolean;
  riskLevel?: DecisionRiskLevel;
  effect?: DecisionEffect;
}

export interface DecisionRequest {
  kind: DecisionKind;
  intent: string;
  candidates: readonly DecisionCandidate[];
  questions: readonly DecisionQuestion[];
  /** Soft cap on serialized state bytes; providers may truncate metadata. */
  budgetBytes?: number;
  timeoutMs?: number;
  /** Redacted hash of the underlying state; never the raw sensitive state. */
  stateHash?: string;
  policy?: DecisionPolicyHint;
}

export interface DecisionScore {
  candidateId: string;
  /** Raw model score in [0, 1] when the provider returns a distribution. */
  score: number;
  /** Calibrated confidence used by policy; defaults to score when omitted. */
  confidence: number;
  reason?: string;
}

export interface DecisionTokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * Provider-neutral result. `ok` describes the provider round-trip, not the
 * policy outcome: a provider may return ok=true with a low-confidence answer
 * that policy then rejects. `fallbackReason` is set when a provider could not
 * complete and the caller must fall back to its deterministic path.
 */
export interface DecisionResult {
  ok: boolean;
  provider: string;
  requestedModelAlias?: string;
  modelAlias?: string;
  selectedIds: string[];
  primaryId?: string;
  scores: DecisionScore[];
  answer?: string;
  distribution?: Record<string, number>;
  confidence: number;
  fallbackReason?: string;
  latencyMs: number;
  tokenUsage?: DecisionTokenUsage;
  raw?: unknown;
}

/**
 * Where a decision was consumed. Recorded on every trace so shadow mode can
 * compare routes without inferring call sites.
 */
export const DECISION_SURFACES = [
  'mcp_adaptive_rank',
  'mcp_discover_rank',
  'result_judge',
  'retry_judge',
  'skill_rank',
  'agent_router',
  'shadow',
] as const;

export type DecisionSurface = typeof DECISION_SURFACES[number];
