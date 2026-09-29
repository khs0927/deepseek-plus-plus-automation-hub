import { getJevApiKey } from '../chat/jev-api-key';
import {
  createDecisionRouter,
  createInMemoryTraceSink,
  type DecisionCandidate,
  type DecisionResult,
  type DecisionRouter,
  type RouteOutcome,
  type RouteRequest,
} from '../decision';
import {
  buildJevCandidateId,
  listJevQuestionOptions,
  parseJevDecisionAnswers,
  parseJevDecisionToolRequest,
  type JevDecisionQuestionSpec,
} from '../decision/jev-contract';
import {
  createSystemOneDecisionProvider,
  isRetryableSystemOneFailure,
  SYSTEM_ONE_DEFAULT_TIMEOUT_MS,
} from '../decision/providers/system-one';
import { DEFAULT_LOCALE, translate, type SupportedLocale } from '../i18n/background';
import type {
  JsonValue,
  ToolCall,
  ToolDescriptor,
  ToolProviderIdentity,
  ToolResult,
} from './types';

// Model-visible Jev decision tool.
//
// Scope rules, inherited from the decision plane and not negotiable here:
//   Decision != Authorization
//   Decision != Execution
//   Decision != Verification
//
// This tool returns typed values and probabilities to the model. It never
// grants permission, never executes anything, and its answer is never proof
// that the underlying claim is true. The model must still route uncertain or
// consequential decisions to the user.

export const JEV_DECIDE_TOOL_PROVIDER_ID = 'jev';
export const JEV_DECIDE_TOOL_NAME = 'jev_decide';
export const JEV_DECIDE_TOOL_DESCRIPTOR_ID = 'local:jev:jev_decide';
export const JEV_DECIDE_TOOL_TIMEOUT_MS = 60_000;

/** Optional host permission the free decision route needs. */
export const JEV_FREE_HOST_ORIGIN = 'https://opencode.ai/*';
/** Optional host permission the paid fallback additionally needs. */
export const JEV_PAID_HOST_ORIGIN = 'https://api.typesafe.ai/*';
export const JEV_HOST_PERMISSION_ERROR_CODE = 'jev_host_permission_required';

/**
 * Both optional origins in one place so the settings toggle, the tool gate and
 * the provider gate cannot drift apart.
 */
export const JEV_HOST_ORIGINS: string[] = [JEV_FREE_HOST_ORIGIN, JEV_PAID_HOST_ORIGIN];

/**
 * Whether the user has granted a host permission.
 *
 * The Jev hosts are optional rather than required so that installing the
 * extension does not hand every user permanent third-party network access.
 * `chrome.permissions.request` needs a user gesture and cannot be called from
 * the background service worker, so the grant happens from the side-panel
 * Settings toggle and this is only a check.
 */
async function hasHostPermission(origin: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

export const JEV_DECIDE_TOOL_PROVIDER: ToolProviderIdentity = {
  kind: 'local',
  id: JEV_DECIDE_TOOL_PROVIDER_ID,
  displayName: translate(DEFAULT_LOCALE, 'tool.jev.providerName'),
  // 'in_process' is the local-provider contract: the registry only lets a
  // local registration own in_process descriptors, and the built-in web tools
  // follow the same rule even though they fetch remotely. The transmission is
  // documented by execution.risk, not by the transport field.
  transport: 'in_process',
};

export function createJevDecideToolProviderIdentity(
  locale: SupportedLocale = DEFAULT_LOCALE,
): ToolProviderIdentity {
  return {
    ...JEV_DECIDE_TOOL_PROVIDER,
    displayName: translate(locale, 'tool.jev.providerName'),
  };
}

export function isJevDecideToolName(name: string): boolean {
  return name === JEV_DECIDE_TOOL_NAME;
}

export function createJevDecideToolDescriptors(
  locale: SupportedLocale = DEFAULT_LOCALE,
): ToolDescriptor[] {
  return [{
    id: JEV_DECIDE_TOOL_DESCRIPTOR_ID,
    provider: createJevDecideToolProviderIdentity(locale),
    name: JEV_DECIDE_TOOL_NAME,
    invocationName: JEV_DECIDE_TOOL_NAME,
    title: translate(locale, 'tool.jev.decideTitle'),
    description: translate(locale, 'tool.jev.decideDescription'),
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: translate(locale, 'tool.jev.stateDescription') },
        questions: {
          type: 'array',
          description: translate(locale, 'tool.jev.questionsDescription'),
        },
      },
      required: ['state', 'questions'],
      additionalProperties: false,
    },
    execution: {
      mode: 'auto',
      enabled: true,
      // The decision state is model-authored free text and leaves the browser
      // to a third-party endpoint, so this is a transmission, not a local
      // read. It stays 'medium' rather than 'low' for that reason.
      risk: 'medium',
      timeoutMs: JEV_DECIDE_TOOL_TIMEOUT_MS,
    },
  }];
}

export interface JevDecideExecutionDeps {
  /**
   * Runs the decision. Injected so tests exercise the tool boundary without a
   * network round-trip; production resolves the real router.
   */
  route: (request: RouteRequest) => Promise<RouteOutcome>;
}

/**
 * Production router: the System One provider uses the free decision route,
 * which needs no credential, and falls back to the paid TypeSafe route when a
 * Jev key is stored, with a bounded in-memory trace so a decision can be
 * explained after the fact without persisting the state that produced it.
 */
export function createJevDecideRouter(): DecisionRouter {
  return createDecisionRouter({
    provider: createSystemOneDecisionProvider({
      getApiKey: getJevApiKey,
      // The paid route is only attempted once its own host permission is
      // actually granted, so a missing grant is reported as the free route's
      // own failure rather than as an opaque cross-origin error.
      hasPaidHostPermission: () => hasHostPermission(JEV_PAID_HOST_ORIGIN),
      timeoutMs: SYSTEM_ONE_DEFAULT_TIMEOUT_MS,
    }),
    traceSink: createInMemoryTraceSink(),
  });
}

export async function executeJevDecideToolCall(
  call: ToolCall,
  locale: SupportedLocale = DEFAULT_LOCALE,
  options?: { deps?: JevDecideExecutionDeps; signal?: AbortSignal },
): Promise<ToolResult> {
  const provider = call.provider ?? createJevDecideToolProviderIdentity(locale);

  if (!isJevDecideToolName(call.name)) {
    return {
      ok: false,
      name: call.name,
      provider,
      summary: translate(locale, 'tool.jev.unsupported'),
      error: {
        code: 'jev_tool_unsupported',
        message: `Unsupported Jev tool: ${call.name}`,
        retryable: false,
      },
    };
  }

  const parsed = parseJevDecisionToolRequest(call.payload);
  if (!parsed.ok) {
    return {
      ok: false,
      name: call.name,
      provider,
      summary: translate(locale, 'tool.jev.invalidPayload'),
      detail: parsed.message,
      error: { code: parsed.code, message: parsed.message, retryable: false },
    };
  }

  const { state, questions } = parsed.request;

  if (!await hasHostPermission(JEV_FREE_HOST_ORIGIN)) {
    return {
      ok: false,
      name: call.name,
      provider,
      summary: translate(locale, 'tool.jev.hostPermissionRequired'),
      detail: translate(locale, 'tool.jev.hostPermissionDetail'),
      error: {
        code: JEV_HOST_PERMISSION_ERROR_CODE,
        message: 'The Jev decision tool needs optional host access to opencode.ai. Enable it in Settings > API.',
        // The user has to grant a permission; retrying on its own cannot help.
        retryable: false,
      },
    };
  }

  const route = options?.deps?.route ?? createJevDecideRouter().route;

  let outcome: RouteOutcome;
  try {
    outcome = await route({
      surface: 'agent_decide',
      intent: state,
      candidates: buildDecisionCandidates(questions),
      typedQuestions: questions,
      timeoutMs: JEV_DECIDE_TOOL_TIMEOUT_MS,
    });
  } catch (error) {
    // The provider contract forbids throwing, so reaching here is a
    // programmer error rather than a transport failure.
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      name: call.name,
      provider,
      summary: translate(locale, 'tool.jev.unavailable'),
      detail: message,
      error: { code: 'jev_router_error', message, retryable: false },
    };
  }

  const answers = parseJevDecisionAnswers(outcome.result.raw, questions);
  if (!answers) {
    return {
      ok: false,
      name: call.name,
      provider,
      summary: translate(locale, 'tool.jev.unavailable'),
      detail: outcome.result.fallbackReason ?? 'no answers',
      error: {
        code: 'jev_no_answers',
        message: outcome.result.fallbackReason ?? 'The decision endpoint returned no usable answers.',
        // The provider owns this classification; the tool must not re-derive
        // it by pattern-matching the fallback reason.
        retryable: isRetryableSystemOneFailure(outcome.result),
      },
    };
  }

  return {
    ok: true,
    name: call.name,
    provider,
    summary: translate(locale, 'tool.jev.complete', { count: Object.keys(answers).length }),
    output: {
      model: outcome.result.modelAlias ?? outcome.result.requestedModelAlias ?? null,
      requestedModel: outcome.result.requestedModelAlias ?? null,
      provider: outcome.result.provider,
      answers: answers as unknown as JsonValue,
      // Reported, not applied. `accepted` is the policy layer's own verdict
      // against the threshold resolved in core/decision/policy.ts; the typed
      // answers above are returned either way so the model can see the real
      // probability, and it must still route an uncertain result to the user.
      confidence: outcome.confidence,
      threshold: outcome.threshold,
      accepted: outcome.accepted,
      traceId: outcome.traceId,
    } as unknown as JsonValue,
  };
}

/**
 * Flatten every question's options into the shared ranking vocabulary. Option
 * ids are namespaced by question id because they are only unique within their
 * question.
 */
export function buildDecisionCandidates(
  questions: readonly JevDecisionQuestionSpec[],
): DecisionCandidate[] {
  const candidates: DecisionCandidate[] = [];
  for (const question of questions) {
    const options = listJevQuestionOptions(question);
    const criteria = question.type === 'choice' ? question.criteria : null;
    for (const optionId of options) {
      candidates.push({
        id: buildJevCandidateId(question.id, optionId),
        label: optionId,
        description: criteria?.[optionId],
      });
    }
  }
  return candidates;
}


