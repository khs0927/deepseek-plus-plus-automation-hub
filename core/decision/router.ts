import type { DecisionProvider } from './provider';
import {
  applyDecisionThreshold,
  classifyDescriptor,
  resolveDecisionThreshold,
} from './policy';
import {
  createDecisionTraceId,
  createNoopTraceSink,
  hashDecisionState,
  previewText,
  type DecisionTraceSink,
} from './trace';
import type {
  DecisionCandidate,
  DecisionPolicyHint,
  DecisionQuestion,
  DecisionRiskLevel,
  DecisionResult,
  DecisionSurface,
} from './types';

/**
 * High-level entry point for the JEV Decision Plane.
 *
 * Responsibilities are deliberately narrow:
 *   - fan out N narrow questions over one shared state (multi-select)
 *   - run the chosen provider (with a deterministic fallback)
 *   - apply the authoritative policy threshold
 *   - record a bounded trace
 *
 * It never authorizes, never executes and never verifies a result. Callers own
 * those steps. When the provider fails or answers below threshold, `accepted`
 * is false and `orderedIds` still contains the deterministic fallback order so
 * the caller can keep working exactly as it did before Jev existed.
 */
export interface DecisionRouterOptions {
  provider: DecisionProvider;
  /** Deterministic baseline used both for fallback order and shadow compare. */
  fallbackProvider?: DecisionProvider;
  traceSink?: DecisionTraceSink;
  now?: () => number;
}

export interface RouteRequest {
  surface: DecisionSurface;
  intent: string;
  candidates: readonly DecisionCandidate[];
  questions?: readonly DecisionQuestion[];
  policy?: DecisionPolicyHint;
  /** Pinned ids always survive; used for explicit user/tool selection. */
  pinnedIds?: ReadonlySet<string>;
  maxSelections?: number;
  requestId?: string;
  taskId?: string;
  chatSessionId?: string | null;
  /** When true, no decision is consumed, only traced (Shadow Mode). */
  shadow?: boolean;
}

export interface RouteOutcome {
  /** Ordered candidate ids after policy: the fallback order when rejected. */
  orderedIds: string[];
  /** Ids accepted by policy. Empty when the decision was rejected. */
  acceptedIds: string[];
  primaryId?: string;
  confidence: number;
  threshold: number;
  accepted: boolean;
  result: DecisionResult;
  traceId: string;
}

export interface DecisionRouter {
  route(request: RouteRequest): Promise<RouteOutcome>;
}

const DEFAULT_MAX_SELECTIONS = 8;

export function createDecisionRouter(options: DecisionRouterOptions): DecisionRouter {
  const now = options.now ?? (() => Date.now());
  const traceSink = options.traceSink ?? createNoopTraceSink();

  return {
    async route(request: RouteRequest): Promise<RouteOutcome> {
      const { effect, riskLevel } = resolveCandidatePolicy(request);
      const threshold = resolveDecisionThreshold({ effect, riskLevel });
      const maxSelections = request.maxSelections ?? options.provider ? DEFAULT_MAX_SELECTIONS : 0;
      const result = await options.provider.evaluate({
        kind: 'capability_relevance',
        intent: request.intent,
        candidates: request.candidates,
        questions: request.questions ?? [],
        stateHash: hashDecisionState(request.intent),
        policy: {
          minConfidence: threshold,
          maxSelections,
          riskLevel,
          effect,
          ...request.policy,
        },
      });

      const fallbackOrdered = options.fallbackProvider
        ? (await options.fallbackProvider.evaluate({
          kind: 'capability_relevance',
          intent: request.intent,
          candidates: request.candidates,
          questions: request.questions ?? [],
          policy: { riskLevel, effect },
        })).selectedIds
        : request.candidates.map((candidate) => candidate.id);

      const providerSucceeded = result.ok && result.scores.length > 0;
      const scores = providerSucceeded
        ? result.scores
        : fallbackOrdered.map((id, index) => ({
          candidateId: id,
          score: 1 - index / Math.max(1, fallbackOrdered.length),
          confidence: 1 - index / Math.max(1, fallbackOrdered.length),
        }));

      const { acceptedIds, rejectedIds } = applyDecisionThreshold(scores, {
        threshold,
        maxSelections,
        pinnedIds: request.pinnedIds,
      });

      const orderedIds = [...acceptedIds, ...rejectedIds];
      const accepted = providerSucceeded && acceptedIds.length > 0;
      const confidence = scores.length > 0 ? Math.max(...scores.map((entry) => entry.confidence)) : 0;
      const traceId = createDecisionTraceId();

      traceSink.record({
        id: traceId,
        createdAt: now(),
        surface: request.surface,
        requestId: request.requestId,
        taskId: request.taskId,
        chatSessionId: request.chatSessionId,
        intentHash: hashDecisionState(request.intent),
        intentPreview: previewText(request.intent),
        stateHash: result.ok ? hashDecisionState(request.intent) : undefined,
        candidateIds: request.candidates.map((candidate) => candidate.id),
        provider: result.provider,
        requestedModelAlias: result.requestedModelAlias,
        modelAlias: result.modelAlias,
        selectedIds: result.selectedIds,
        primaryId: result.primaryId,
        confidence,
        threshold,
        distribution: result.distribution,
        riskLevel,
        accepted,
        fallbackReason: result.fallbackReason ?? (!providerSucceeded ? 'empty_scores' : undefined),
        baselineSelectedIds: fallbackOrdered,
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage,
        answerPreview: previewText(result.answer),
      });

      return {
        orderedIds,
        acceptedIds: accepted ? acceptedIds : [],
        primaryId: accepted ? acceptedIds[0] : undefined,
        confidence,
        threshold,
        accepted,
        result,
        traceId,
      };
    },
  };
}

function resolveCandidatePolicy(request: RouteRequest): {
  effect: 'read' | 'compute' | 'write' | 'external_side_effect';
  riskLevel: DecisionRiskLevel;
} {
  if (request.policy?.effect && request.policy?.riskLevel) {
    return { effect: request.policy.effect, riskLevel: request.policy.riskLevel };
  }
  // Without a descriptor we cannot infer effect/risk here, so default to the
  // conservative read/low pair; callers that know the descriptor should pass
  // it explicitly via classifyDescriptor().
  return {
    effect: request.policy?.effect ?? 'read',
    riskLevel: request.policy?.riskLevel ?? 'low',
  };
}

export { classifyDescriptor };
