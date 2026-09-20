import type { ToolCall, ToolDescriptor, ToolResult } from '../tool/types';
import { evaluateDecision, getDecisionRuntimeConfig } from './provider';
import { sanitizeDecisionText } from './sanitize';
import { decisionTraceBuffer } from './trace';

const RESULT_JUDGE_CONFIDENCE_THRESHOLD = 0.80;

export type ToolOutcomeAction = 'accept' | 'retry' | 'escalate';

export interface ToolOutcomeVerdict {
  action: ToolOutcomeAction;
  confidence: number;
  provider: string;
  model?: string;
  advisory: true;
  fallback: boolean;
}

export interface ToolOutcomeJudgeInput {
  call: ToolCall;
  descriptor: ToolDescriptor;
  result: ToolResult;
  signal?: AbortSignal;
}

const OUTCOME_CANDIDATES = [
  {
    id: 'accept',
    name: 'accept',
    title: 'Accept result',
    description: 'The supplied result is internally consistent and sufficiently complete for the requested tool operation based only on the provided evidence.',
  },
  {
    id: 'retry',
    name: 'retry',
    title: 'Retry same operation',
    description: 'The supplied result indicates a transient, retryable, or incomplete execution where repeating the same operation could plausibly help without changing authorization.',
  },
  {
    id: 'escalate',
    name: 'escalate',
    title: 'Escalate for stronger reasoning',
    description: 'The supplied result is ambiguous, conflicting, truncated, risky to retry, or needs stronger reasoning before any follow-up action.',
  },
] as const;

export async function judgeToolOutcome(
  input: ToolOutcomeJudgeInput,
): Promise<ToolOutcomeVerdict | null> {
  const runtime = getDecisionRuntimeConfig();
  if (runtime.mode === 'disabled' || !runtime.provider) return null;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const evidence = buildOutcomeEvidence(input);

  try {
    const result = await evaluateDecision({
      requestId,
      purpose: 'result_judge',
      intent: evidence,
      candidates: OUTCOME_CANDIDATES.map((candidate) => ({ ...candidate })),
      confidenceThreshold: RESULT_JUDGE_CONFIDENCE_THRESHOLD,
    }, input.signal);

    const selected = result.selections[0];
    const selectedId = selected?.candidateId;
    const validAction = isToolOutcomeAction(selectedId) ? selectedId : null;
    const fallback = (
      result.escalated === true ||
      result.confidence < RESULT_JUDGE_CONFIDENCE_THRESHOLD ||
      validAction === null
    );
    const action: ToolOutcomeAction = fallback ? 'escalate' : validAction;

    decisionTraceBuffer.record({
      requestId,
      purpose: 'result_judge',
      mode: runtime.mode,
      provider: result.provider || runtime.provider.id,
      ...(result.model ? { model: result.model } : {}),
      candidateIds: OUTCOME_CANDIDATES.map((candidate) => candidate.id),
      selectedIds: validAction ? [validAction] : [],
      confidence: result.confidence,
      threshold: RESULT_JUDGE_CONFIDENCE_THRESHOLD,
      ...(fallback
        ? { fallbackReason: result.escalationReason ?? (
          result.confidence < RESULT_JUDGE_CONFIDENCE_THRESHOLD
            ? 'low_confidence'
            : 'no_selection'
        ) }
        : {}),
      latencyMs: Date.now() - startedAt,
      applied: false,
    });

    return {
      action,
      confidence: result.confidence,
      provider: result.provider || runtime.provider.id,
      ...(result.model ? { model: result.model } : {}),
      advisory: true,
      fallback,
    };
  } catch {
    decisionTraceBuffer.record({
      requestId,
      purpose: 'result_judge',
      mode: runtime.mode,
      provider: runtime.provider.id,
      candidateIds: OUTCOME_CANDIDATES.map((candidate) => candidate.id),
      selectedIds: [],
      threshold: RESULT_JUDGE_CONFIDENCE_THRESHOLD,
      fallbackReason: 'provider_error',
      latencyMs: Date.now() - startedAt,
      applied: false,
    });

    return {
      action: 'escalate',
      confidence: 0,
      provider: runtime.provider.id,
      advisory: true,
      fallback: true,
    };
  }
}

function buildOutcomeEvidence(input: ToolOutcomeJudgeInput): string {
  const result = input.result;
  const pieces = [
    `Tool: ${input.descriptor.title || input.call.name}`,
    `Invocation: ${input.descriptor.invocationName || input.call.invocationName || input.call.name}`,
    `Declared risk: ${input.descriptor.execution.risk}`,
    `Provider result ok: ${result.ok ? 'true' : 'false'}`,
    `Summary: ${result.summary}`,
    result.detail ? `Detail: ${result.detail}` : '',
    result.error
      ? `Error: code=${result.error.code}; retryable=${result.error.retryable}; message=${result.error.message}`
      : '',
    result.truncated ? 'The returned result was truncated.' : '',
  ].filter(Boolean);

  return sanitizeDecisionText(pieces.join('\n'), 4_000);
}

function isToolOutcomeAction(value: unknown): value is ToolOutcomeAction {
  return value === 'accept' || value === 'retry' || value === 'escalate';
}
