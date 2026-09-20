import { tokenize, normalizeSearchText } from '../../mcp/capability-projection';
import type { DecisionProvider } from '../provider';
import type {
  DecisionCandidate,
  DecisionRequest,
  DecisionResult,
  DecisionScore,
} from '../types';

/**
 * Deterministic lexical mock provider.
 *
 * It exists for three reasons:
 *   1. Shadow Mode and unit tests must not depend on a live TypeSafe key.
 *   2. It is the calibration baseline: Jev output can be compared against a
 *      reproducible, well-understood scoring function.
 *   3. It proves the DecisionProvider seam is real (no TypeSafe leakage).
 *
 * It intentionally mirrors the current lexical ranking signals, so when it is
 * wired as the active provider the system behaves like today's router.
 */
export interface MockDecisionProviderOptions {
  id?: string;
  /** Injected clock so tests can assert latency deterministically. */
  now?: () => number;
}

export function createMockDecisionProvider(
  options: MockDecisionProviderOptions = {},
): DecisionProvider {
  const id = options.id ?? 'mock';
  const now = options.now ?? (() => Date.now());
  return {
    id,
    async evaluate(request: DecisionRequest): Promise<DecisionResult> {
      const startedAt = now();
      const normalizedQuery = normalizeSearchText(request.intent);
      const queryTerms = tokenize(normalizedQuery);
      const scores = request.candidates
        .map((candidate) => scoreCandidate(candidate, normalizedQuery, queryTerms))
        .sort((left, right) => (
          right.confidence - left.confidence ||
          (left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0)
        ));
      const selectedIds = scores
        .filter((entry) => entry.confidence > 0)
        .map((entry) => entry.candidateId);
      const topConfidence = scores.length > 0 ? scores[0].confidence : 0;
      return {
        ok: true,
        provider: id,
        modelAlias: 'mock-lexical',
        selectedIds,
        primaryId: selectedIds[0],
        scores,
        confidence: topConfidence,
        latencyMs: Math.max(0, now() - startedAt),
      };
    },
  };
}

function scoreCandidate(
  candidate: DecisionCandidate,
  normalizedQuery: string,
  queryTerms: readonly string[],
): DecisionScore {
  const haystack = normalizeSearchText(
    `${candidate.label} ${candidate.id} ${candidate.description ?? ''}`,
  );
  let raw = 0;
  if (normalizedQuery && haystack.includes(normalizedQuery)) raw += 0.6;
  for (const term of queryTerms) {
    if (haystack.includes(term)) raw += 0.2;
  }
  const score = Math.max(0, Math.min(1, raw));
  return {
    candidateId: candidate.id,
    score,
    confidence: score,
  };
}
