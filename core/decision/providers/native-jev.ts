import { createUnavailableDecisionProvider, type DecisionProvider } from '../provider';
import type { DecisionRequest, DecisionResult } from '../types';

/**
 * Transport the Native Host exposes to the extension for Jev evaluation.
 *
 * This is a Control Plane RPC, NOT an MCP tool. It must never be registered as
 * a model-visible capability. The TypeSafe API key lives only inside the
 * Native Host (local env / OS secret store); the extension sends sanitized
 * decision state and receives typed scores back.
 */
export interface JevDecisionTransport {
  /**
   * Send a decision request and resolve with the provider-neutral result. A
   * transport failure must reject or resolve to { ok: false } rather than
   * throwing past the provider boundary.
   */
  evaluate(request: DecisionRequest): Promise<NativeJevRawResponse>;
}

/**
 * Raw response shape returned by the native host. Kept narrow: the native side
 * normalizes TypeSafe's response into this contract so the extension never
 * parses a vendor payload.
 */
export interface NativeJevRawResponse {
  ok: boolean;
  modelAlias?: string;
  distribution?: Record<string, number>;
  answer?: string;
  scores?: Array<{ candidateId: string; score: number; confidence?: number; reason?: string }>;
  confidence?: number;
  fallbackReason?: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
  raw?: unknown;
}

export const NATIVE_JEV_PROVIDER_ID = 'native-jev';

/**
 * Build a DecisionProvider backed by the Native Host Jev RPC.
 *
 * `transport` is `null` when the native host is not connected (e.g. the
 * extension is running without the host installed). In that case the provider
 * reports unavailability and every caller takes its deterministic fallback.
 */
export function createNativeJevDecisionProvider(
  transport: JevDecisionTransport | null,
  options: { id?: string; now?: () => number } = {},
): DecisionProvider {
  const id = options.id ?? NATIVE_JEV_PROVIDER_ID;
  const now = options.now ?? (() => Date.now());
  if (!transport) {
    return createUnavailableDecisionProvider(id, 'native_host_unavailable');
  }
  return {
    id,
    async evaluate(request: DecisionRequest): Promise<DecisionResult> {
      const startedAt = now();
      try {
        const response = await transport.evaluate(request);
        const latencyMs = Math.max(0, now() - startedAt);
        if (!response.ok) {
          return {
            ok: false,
            provider: id,
            selectedIds: [],
            scores: [],
            confidence: 0,
            fallbackReason: response.fallbackReason ?? 'native_jev_not_ok',
            latencyMs,
          };
        }
        const scores = (response.scores ?? []).map((entry) => ({
          candidateId: entry.candidateId,
          score: entry.score,
          confidence: entry.confidence ?? entry.score,
          reason: entry.reason,
        }));
        const selectedIds = [...scores]
          .sort((left, right) => (
            right.confidence - left.confidence ||
            (left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0)
          ))
          .map((entry) => entry.candidateId);
        return {
          ok: true,
          provider: id,
          modelAlias: response.modelAlias,
          selectedIds,
          primaryId: selectedIds[0],
          scores,
          answer: response.answer,
          distribution: response.distribution,
          confidence: response.confidence ?? scores[0]?.confidence ?? 0,
          latencyMs,
          tokenUsage: response.tokenUsage,
          raw: response.raw,
        };
      } catch (error) {
        return {
          ok: false,
          provider: id,
          selectedIds: [],
          scores: [],
          confidence: 0,
          fallbackReason: error instanceof Error
            ? `native_jev_error:${error.name}`
            : 'native_jev_error',
          latencyMs: Math.max(0, now() - startedAt),
        };
      }
    },
  };
}
