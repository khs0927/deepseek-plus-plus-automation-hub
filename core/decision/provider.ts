import type {
  DecisionRequest,
  DecisionResult,
} from './contract';

export type DecisionRuntimeMode = 'disabled' | 'shadow' | 'active';

export interface DecisionProvider {
  readonly id: string;
  evaluate(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResult>;
}

export interface DecisionRuntimeConfig {
  mode: DecisionRuntimeMode;
  provider: DecisionProvider | null;
  timeoutMs: number;
}

const DEFAULT_DECISION_TIMEOUT_MS = 1_500;

let runtimeConfig: DecisionRuntimeConfig = {
  mode: 'shadow',
  provider: null,
  timeoutMs: DEFAULT_DECISION_TIMEOUT_MS,
};

export function getDecisionRuntimeConfig(): DecisionRuntimeConfig {
  return { ...runtimeConfig };
}

export function configureDecisionRuntime(
  patch: Partial<DecisionRuntimeConfig>,
): DecisionRuntimeConfig {
  runtimeConfig = {
    ...runtimeConfig,
    ...patch,
  };
  return getDecisionRuntimeConfig();
}

export function resetDecisionRuntimeForTests(): void {
  runtimeConfig = {
    mode: 'shadow',
    provider: null,
    timeoutMs: DEFAULT_DECISION_TIMEOUT_MS,
  };
}

export async function evaluateDecision(
  request: DecisionRequest,
  signal?: AbortSignal,
): Promise<DecisionResult> {
  const { provider, timeoutMs } = runtimeConfig;
  if (!provider) throw new Error('Decision provider is not configured.');

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => controller.abort(signal?.reason);

  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeout = setTimeout(() => {
      controller.abort(new Error(`Decision provider timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  }

  try {
    const result = await provider.evaluate(request, controller.signal);
    return validateDecisionResult(result, request);
  } finally {
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

function validateDecisionResult(
  result: DecisionResult,
  request: DecisionRequest,
): DecisionResult {
  if (!result || typeof result !== 'object') {
    throw new Error('Decision provider returned an invalid result.');
  }
  if (!isProbability(result.confidence)) {
    throw new Error('Decision result confidence must be between 0 and 1.');
  }

  const candidateIds = new Set(request.candidates.map((candidate) => candidate.id));
  const seen = new Set<string>();
  for (const selection of result.selections) {
    if (!candidateIds.has(selection.candidateId)) {
      throw new Error(`Decision result referenced an unknown candidate: ${selection.candidateId}`);
    }
    if (seen.has(selection.candidateId)) {
      throw new Error(`Decision result contains duplicate candidate: ${selection.candidateId}`);
    }
    if (!isProbability(selection.confidence)) {
      throw new Error(`Decision selection confidence is invalid: ${selection.candidateId}`);
    }
    seen.add(selection.candidateId);
  }

  return {
    ...result,
    selections: result.selections.map((selection) => ({ ...selection })),
  };
}

function isProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
