import type { DecisionRequest, DecisionResult } from './types';

/**
 * Provider abstraction for the JEV Decision Plane.
 *
 * TypeSafe Jev is an early-access dependency, so nothing in the codebase may
 * bind directly to its HTTP shape. Every caller depends on this interface and
 * the concrete TypeSafe / Native Host / mock / future-local implementations
 * live behind it. A JEV-compatible API must not be assumed to have the same
 * calibration as the real Jev model.
 */
export interface DecisionProvider {
  /** Stable identifier recorded on every trace (e.g. 'mock', 'native-jev'). */
  readonly id: string;

  /**
   * Evaluate a narrow decision. Implementations must never throw for a
   * transport failure: they resolve with `ok: false` and a `fallbackReason`
   * so the caller can fall back to its deterministic path. Throwing is
   * reserved for programmer errors.
   */
  evaluate(request: DecisionRequest): Promise<DecisionResult>;
}

/**
 * A provider that is known to be unreachable or unconfigured. It always
 * resolves to a non-ok result so callers exercise the fallback path without a
 * special case in their own code.
 */
export function createUnavailableDecisionProvider(
  id: string,
  reason: string,
): DecisionProvider {
  return {
    id,
    async evaluate(): Promise<DecisionResult> {
      return {
        ok: false,
        provider: id,
        selectedIds: [],
        scores: [],
        confidence: 0,
        fallbackReason: reason,
        latencyMs: 0,
      };
    },
  };
}
