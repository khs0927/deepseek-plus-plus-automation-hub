export interface DecisionStatus {
  configured: boolean;
  provider: 'typesafe';
  model: string;
  mode: 'disabled' | 'shadow' | 'active';
}

export interface DecisionProviderOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  logLine?: (line: string) => void;
  timeoutMs?: number;
}

export interface DecisionMethodHandler {
  method: 'decision/status' | 'decision/evaluate';
  handle(params?: Record<string, unknown>): Promise<unknown>;
}

export function createDecisionMethodHandlers(
  options?: DecisionProviderOptions,
): DecisionMethodHandler[];

export function getDecisionStatus(
  env?: Record<string, string | undefined>,
): DecisionStatus;

export function evaluateDecisionRequest(
  params: {
    request?: Record<string, unknown>;
  },
  options?: DecisionProviderOptions,
): Promise<Record<string, unknown>>;
