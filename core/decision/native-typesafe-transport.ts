import { SHELL_MCP_NATIVE_HOST } from '../shell';
import { requestNativeInternal } from '../mcp/transports/native';
import type {
  TypeSafeSystemOneRequest,
  TypeSafeSystemOneTransport,
} from './typesafe-jev-provider';
import type { DecisionRuntimeMode } from './provider';

const NATIVE_DECISION_TIMEOUT_MS = 10_000;

export interface NativeTypeSafeDecisionStatus {
  configured: boolean;
  provider: 'typesafe';
  model: string;
  mode: DecisionRuntimeMode;
}

export function createNativeTypeSafeSystemOneTransport(): TypeSafeSystemOneTransport {
  return {
    evaluate(payload, signal) {
      return requestNativeInternal<unknown>({
        nativeHost: SHELL_MCP_NATIVE_HOST,
        method: 'decision/evaluate',
        params: { request: payload as unknown as Record<string, unknown> },
        timeoutMs: NATIVE_DECISION_TIMEOUT_MS,
        signal,
      });
    },
  };
}

export async function getNativeTypeSafeDecisionStatus(
  signal?: AbortSignal,
): Promise<NativeTypeSafeDecisionStatus> {
  const status = await requestNativeInternal<unknown>({
    nativeHost: SHELL_MCP_NATIVE_HOST,
    method: 'decision/status',
    timeoutMs: 3_000,
    signal,
  });
  return decodeNativeDecisionStatus(status);
}

function decodeNativeDecisionStatus(value: unknown): NativeTypeSafeDecisionStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Native decision status is invalid.');
  }
  const raw = value as Record<string, unknown>;
  const mode = raw.mode;
  if (mode !== 'disabled' && mode !== 'shadow' && mode !== 'active') {
    throw new Error('Native decision status returned an unsupported mode.');
  }
  const model = typeof raw.model === 'string' && raw.model.trim()
    ? raw.model.trim()
    : 'jev-latest';
  return {
    configured: raw.configured === true,
    provider: 'typesafe',
    model,
    mode,
  };
}
