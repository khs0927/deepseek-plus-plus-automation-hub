import { createAbortScope } from '../../network/abort';
import type { DecisionProvider } from '../provider';
import {
  buildJevCandidateId,
  listJevQuestionOptions,
  parseJevDecisionAnswers,
  type JevDecisionAnswer,
  type JevDecisionQuestionSpec,
} from '../jev-contract';
import type { DecisionRequest, DecisionResult, DecisionScore } from '../types';

// JEV Decision Plane - System One transport.
//
// This is the only module in the codebase allowed to know the System One HTTP
// shape (see ./provider.ts). Every other caller depends on DecisionProvider.
//
// Routing is free-first. The free OpenCode Zen route is always attempted first
// and needs no credential. A paid TypeSafe route exists ONLY as a documented
// fallback: it is consulted after the free route fails transiently AND a key
// is configured, and it is never used to mask a defect in our own request. A
// non-retryable free failure (400, or 422 without a server_error body) is
// reported as-is rather than being re-issued against another vendor, because
// that would replace our own signal with someone else's. The fallback is
// reported, never silent: a non-ok result always names the route that failed.

export const SYSTEM_ONE_PROVIDER_ID = 'system-one';
export const SYSTEM_ONE_FREE_ENDPOINT = 'https://opencode.ai/zen/v1/systemone';
export const SYSTEM_ONE_FREE_MODEL = 'jev-1.13-free';
export const SYSTEM_ONE_TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const SYSTEM_ONE_TYPESAFE_MODEL = 'jev-1.13.0';
export const SYSTEM_ONE_DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Statuses that describe the free route being unavailable rather than a
 * defective request. The caller uses this to decide whether the reported
 * failure is worth retrying later. A 4xx that is not in this list (notably 400
 * and 422) means the request itself is wrong.
 */
export const SYSTEM_ONE_RETRYABLE_STATUSES = [401, 403, 404, 408, 425, 429] as const;

export function isRetryableSystemOneStatus(status: number): boolean {
  return (SYSTEM_ONE_RETRYABLE_STATUSES as readonly number[]).includes(status) || status >= 500;
}

/**
 * Server-side error types the endpoint reports in the body.
 *
 * The free route can report an upstream outage as HTTP 422 with
 * `type: "server_error"` in the body rather than a 5xx. Observed live, not
 * theorized: with the free model down the endpoint answers 422 and the status
 * alone would classify it as a malformed request, which would hard-fail the
 * tool and report it as a malformed request. The body is the stronger signal
 * about who is at fault, so it wins over a status that would otherwise mean
 * "our request is wrong".
 */
export const SYSTEM_ONE_SERVER_ERROR_TYPES = ['server_error', 'api_error', 'overloaded_error'] as const;

export function isSystemOneServerError(body: unknown): boolean {
  if (!isRecord(body)) return false;
  const types = new Set<string>(SYSTEM_ONE_SERVER_ERROR_TYPES);
  // The endpoint nests the payload one or two levels deep depending on the
  // gateway in front of it, so check each level rather than one fixed path.
  let cursor: unknown = body;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(cursor)) return false;
    const type = cursor.type;
    if (typeof type === 'string' && types.has(type)) return true;
    cursor = cursor.error;
  }
  return false;
}

export interface SystemOneDecisionProviderOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /**
   * Reads the TypeSafe key for the documented fallback. The free route needs
   * no key; this is consulted ONLY after a transient free-route failure.
   * Returning null is a valid configuration meaning "no fallback available",
   * and the provider then reports the free route's own failure reason.
   */
  getApiKey: () => Promise<string | null>;
}

interface SystemOneAttempt {
  ok: boolean;
  endpoint: string;
  requestedModel: string;
  status?: number;
  body?: unknown;
  networkError?: { name: string; message: string };
}

export function createSystemOneDecisionProvider(
  options: SystemOneDecisionProviderOptions,
): DecisionProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? SYSTEM_ONE_DEFAULT_TIMEOUT_MS;

  return {
    id: SYSTEM_ONE_PROVIDER_ID,
    async evaluate(request: DecisionRequest): Promise<DecisionResult> {
      const startedAt = now();
      const questions = resolveSystemOneQuestions(request);
      if (questions.length === 0) {
        return unavailable(SYSTEM_ONE_PROVIDER_ID, 'no_decision_questions', now() - startedAt);
      }

      const state = request.intent;
      const requestTimeoutMs = request.timeoutMs ?? timeoutMs;

      const freeAttempt = await invokeSystemOne({
        fetchImpl,
        endpoint: SYSTEM_ONE_FREE_ENDPOINT,
        model: SYSTEM_ONE_FREE_MODEL,
        apiKey: null,
        state,
        questions,
        timeoutMs: requestTimeoutMs,
      });

      if (freeAttempt.ok) {
        return toDecisionResult(freeAttempt, questions, now() - startedAt);
      }

      // Only a transient free-route failure is worth a second request. A 400,
      // or a 422 with no server_error body, is a defect in OUR request: sending
      // it to another vendor would bury that defect under someone else's error
      // and report a malformed request as a provider problem.
      if (!isRetryableSystemOneAttempt(freeAttempt)) {
        return unavailable(
          SYSTEM_ONE_PROVIDER_ID,
          describeAttemptFailure(freeAttempt),
          now() - startedAt,
          freeAttempt,
        );
      }

      const freeReason = describeAttemptFailure(freeAttempt);
      const fallbackKey = await readFallbackKey(options.getApiKey);
      if (fallbackKey === null) {
        // A transient free-route failure with no key configured. The free
        // reason is kept and suffixed rather than replaced, so the caller can
        // still tell an outage apart from a missing configuration.
        return unavailable(
          SYSTEM_ONE_PROVIDER_ID,
          `${freeReason}:no_fallback_key`,
          now() - startedAt,
          freeAttempt,
        );
      }

      const fallbackAttempt = await invokeSystemOne({
        fetchImpl,
        endpoint: SYSTEM_ONE_TYPESAFE_ENDPOINT,
        model: SYSTEM_ONE_TYPESAFE_MODEL,
        apiKey: fallbackKey,
        state,
        questions,
        timeoutMs: requestTimeoutMs,
      });

      if (fallbackAttempt.ok) {
        // The caller asked for the free model. Keep that visible as the
        // requested alias and report separately which model actually answered.
        return toDecisionResult(fallbackAttempt, questions, now() - startedAt, SYSTEM_ONE_FREE_MODEL);
      }

      return unavailable(
        SYSTEM_ONE_PROVIDER_ID,
        describeAttemptFailure(fallbackAttempt),
        now() - startedAt,
        fallbackAttempt,
      );
    },
  };
}

interface InvokeSystemOneInput {
  fetchImpl: typeof fetch;
  endpoint: string;
  model: string;
  /**
   * Bearer credential for this route, or null when the route needs none. The
   * free route always passes null and therefore sends no Authorization header.
   */
  apiKey: string | null;
  state: string;
  questions: readonly JevDecisionQuestionSpec[];
  timeoutMs: number;
  signal?: AbortSignal;
}

async function invokeSystemOne(input: InvokeSystemOneInput): Promise<SystemOneAttempt> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // An absent or empty key means "no credential for this route". Sending
  // `Bearer ` to a route that takes no credential would turn a working free
  // route into an auth failure, so the header is only added when there is a
  // real token to send.
  if (input.apiKey !== null && input.apiKey.length > 0) {
    headers.Authorization = `Bearer ${input.apiKey}`;
  }

  const scope = createAbortScope(input.signal, input.timeoutMs);
  try {
    const response = await input.fetchImpl(input.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        state: input.state,
        // `questions` is an object keyed by question id, NOT an array. The id
        // is the key and is not repeated inside the value. Verified against
        // the live endpoint: an array is rejected with HTTP 422
        // "Input should be a valid dictionary".
        questions: toSystemOneQuestions(input.questions),
        model: input.model,
      }),
      signal: scope.signal,
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      return {
        ok: false,
        endpoint: input.endpoint,
        requestedModel: input.model,
        status: response.status,
        body,
      };
    }
    return {
      ok: true,
      endpoint: input.endpoint,
      requestedModel: input.model,
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      endpoint: input.endpoint,
      requestedModel: input.model,
      networkError: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : 'Network request failed',
      },
    };
  } finally {
    scope.cleanup();
  }
}

/**
 * Forward the caller's narrow questions verbatim. A caller that only supplied
 * a candidate ranking is translated into one choice question so the internal
 * ranking surfaces keep working through the same provider.
 */
function resolveSystemOneQuestions(request: DecisionRequest): readonly JevDecisionQuestionSpec[] {
  if (request.typedQuestions && request.typedQuestions.length > 0) {
    return request.typedQuestions;
  }
  if (request.candidates.length === 0) return [];

  const criteria: Record<string, string> = {};
  for (const candidate of request.candidates) {
    criteria[candidate.id] = candidate.description ?? candidate.label;
  }

  const instructions = request.questions[0]?.prompt
    ?? `Select the best option for: ${request.intent}`;

  return [{
    id: request.questions[0]?.id ?? 'primary',
    type: 'choice',
    instructions,
    criteria,
  }];
}

function toSystemOneQuestions(
  questions: readonly JevDecisionQuestionSpec[],
): Record<string, Record<string, unknown>> {
  const payload: Record<string, Record<string, unknown>> = {};
  for (const question of questions) {
    if (question.type === 'choice') {
      payload[question.id] = {
        type: 'choice',
        instructions: question.instructions,
        criteria: question.criteria,
      };
      continue;
    }
    if (question.type === 'score') {
      payload[question.id] = {
        type: 'score',
        instructions: question.instructions,
        criteria: [...question.criteria],
      };
      continue;
    }
    payload[question.id] = { type: 'noul', instructions: question.instructions };
  }
  return payload;
}

function toDecisionResult(
  attempt: SystemOneAttempt,
  questions: readonly JevDecisionQuestionSpec[],
  latencyMs: number,
  requestedModelAlias?: string,
): DecisionResult {
  const body = isRecord(attempt.body) ? attempt.body : {};
  // The contract module owns answer validation. This provider must not carry a
  // second parser for the same response shape: a looser copy here accepted a
  // 129-char candidate id that the tool's parser then rejected, so a decision
  // that was actually made and ranked was reported as "no answers".
  const answers = parseJevDecisionAnswers(attempt.body, questions) ?? {};
  const scores: DecisionScore[] = [];
  let confidence = 0;

  for (const question of questions) {
    const answer = answers[question.id];
    if (!answer) continue;
    for (const score of toScores(question, answer)) {
      scores.push(score);
      if (score.confidence > confidence) confidence = score.confidence;
    }
  }

  const selectedIds = [...scores]
    .sort((left, right) => (
      right.confidence - left.confidence ||
      (left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0)
    ))
    .map((score) => score.candidateId);

  return {
    ok: scores.length > 0,
    provider: SYSTEM_ONE_PROVIDER_ID,
    requestedModelAlias: requestedModelAlias ?? attempt.requestedModel,
    // The model that actually answered, not the one that was requested. A
    // provider that echoes the requested id cannot be used as evidence here.
    modelAlias: readAnsweredModel(body) ?? attempt.requestedModel,
    selectedIds,
    primaryId: selectedIds[0],
    scores,
    distribution: readDistribution(body),
    confidence,
    fallbackReason: scores.length > 0 ? undefined : 'empty_scores',
    latencyMs: Math.max(0, latencyMs),
    raw: attempt.body,
  };
}

/**
 * Build candidate scores from real returned probabilities only. A question that
 * returned no distribution contributes its single answer with its own
 * confidence; nothing is invented to pad a ranking to full width.
 */
function toScores(
  question: JevDecisionQuestionSpec,
  answer: JevDecisionAnswer,
): DecisionScore[] {
  const options = listJevQuestionOptions(question);
  const scores: DecisionScore[] = [];

  if (answer.type === 'noul') {
    scores.push({ candidateId: buildJevCandidateId(question.id, 'true'), score: answer.noul, confidence: answer.noul });
    const complement = 1 - answer.noul;
    scores.push({ candidateId: buildJevCandidateId(question.id, 'false'), score: complement, confidence: complement });
    return scores;
  }

  if (answer.type === 'choice') {
    const probabilities = Object.keys(answer.probabilities).length > 0
      ? answer.probabilities
      : { [answer.choice]: answer.confidence };
    for (const optionId of options) {
      const probability = probabilities[optionId];
      if (probability === undefined) continue;
      scores.push({
        candidateId: buildJevCandidateId(question.id, optionId),
        score: probability,
        confidence: probability,
      });
    }
    if (scores.length === 0) {
      scores.push({
        candidateId: buildJevCandidateId(question.id, answer.choice),
        score: answer.confidence,
        confidence: answer.confidence,
      });
    }
    return scores;
  }

  // A score answer names a rubric INDEX, and the endpoint ships the matching
  // distribution keyed by that index. Prefer the real distribution; fall back
  // to the single selected level with its own confidence rather than inventing
  // probabilities for the levels that were never scored.
  if (answer.probabilities && Object.keys(answer.probabilities).length > 0) {
    for (let index = 0; index < options.length; index += 1) {
      const probability = answer.probabilities[String(index)];
      const levelId = options[index];
      if (probability === undefined || levelId === undefined) continue;
      scores.push({
        candidateId: buildJevCandidateId(question.id, levelId),
        score: probability,
        confidence: probability,
      });
    }
    if (scores.length > 0) return scores;
  }

  if (!answer.level) return [];
  scores.push({
    candidateId: buildJevCandidateId(question.id, answer.level),
    score: answer.confidence,
    confidence: answer.confidence,
  });
  return scores;
}

function readAnsweredModel(body: Record<string, unknown>): string | undefined {
  const model = body.model;
  return typeof model === 'string' && model.trim().length > 0 ? model.trim() : undefined;
}

function readDistribution(body: Record<string, unknown>): Record<string, number> | undefined {
  const raw = body.distribution;
  if (!isRecord(raw)) return undefined;
  const distribution = readProbabilityMap(raw);
  return Object.keys(distribution).length > 0 ? distribution : undefined;
}

function readProbabilityMap(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const probability = readProbability(value);
    if (probability !== null) values[key] = probability;
  }
  return values;
}

function readProbability(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 1) return null;
  return raw;
}

export function isRetryableSystemOneAttempt(attempt: SystemOneAttempt): boolean {
  if (attempt.networkError) return true;
  // A server-side error body means the endpoint is at fault, whatever status
  // the gateway attached to it.
  if (isSystemOneServerError(attempt.body)) return true;
  if (attempt.status === undefined) return false;
  return isRetryableSystemOneStatus(attempt.status);
}

// Derived from the one status list so a second copy of these numbers cannot
// drift out of sync with SYSTEM_ONE_RETRYABLE_STATUSES.
const RETRYABLE_STATUS_REASON = new RegExp(
  `^system_one_status_(?:${SYSTEM_ONE_RETRYABLE_STATUSES.join('|')}|5\\d\\d)$`,
);

/**
 * Classify a reported failure as transient. This is the single authority: the
 * provider builds `fallbackReason` and callers must not re-derive this boolean
 * by pattern-matching that string, or the two vocabularies can drift.
 */
export function isRetryableSystemOneFailure(
  result: Pick<DecisionResult, 'fallbackReason'>,
): boolean {
  const reason = result.fallbackReason;
  if (!reason) return false;
  if (reason.startsWith('system_one_network_error')) return true;
  if (reason.startsWith('system_one_server_error')) return true;
  return RETRYABLE_STATUS_REASON.test(reason);
}

export function describeAttemptFailure(attempt: SystemOneAttempt): string {
  if (attempt.networkError) return `system_one_network_error:${attempt.networkError.name}`;
  if (isSystemOneServerError(attempt.body)) return 'system_one_server_error';
  return `system_one_status_${attempt.status ?? 'unknown'}`;
}

function unavailable(
  provider: string,
  fallbackReason: string,
  latencyMs: number,
  attempt?: SystemOneAttempt,
): DecisionResult {
  return {
    ok: false,
    provider,
    requestedModelAlias: attempt?.requestedModel,
    modelAlias: attempt?.ok ? readAnsweredModel(isRecord(attempt.body) ? attempt.body : {}) : undefined,
    selectedIds: [],
    scores: [],
    confidence: 0,
    fallbackReason,
    latencyMs: Math.max(0, latencyMs),
    raw: attempt?.body,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read the fallback credential without letting the read escape the provider.
 * A key store that throws must not take the whole evaluation down: the
 * fallback is optional, so a failed read is reported as "no fallback
 * available" and the free route's own reason stands. The value is trimmed and
 * an empty result is treated as no key, so a whitespace-only entry never
 * becomes a bare `Bearer ` header.
 */
async function readFallbackKey(getApiKey: () => Promise<string | null>): Promise<string | null> {
  try {
    const key = await getApiKey();
    if (typeof key !== 'string') return null;
    const trimmed = key.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
