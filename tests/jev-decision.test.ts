import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildJevCandidateId,
  listJevQuestionOptions,
  parseJevDecisionAnswers,
  parseJevDecisionToolRequest,
  type JevDecisionQuestionSpec,
} from '../core/decision/jev-contract';
import {
  createDecisionRouter,
  createInMemoryTraceSink,
  type RouteRequest,
} from '../core/decision';
import {
  SYSTEM_ONE_FREE_ENDPOINT,
  SYSTEM_ONE_FREE_MODEL,
  SYSTEM_ONE_TYPESAFE_ENDPOINT,
  SYSTEM_ONE_TYPESAFE_MODEL,
  createSystemOneDecisionProvider,
  isRetryableSystemOneFailure,
  isRetryableSystemOneStatus,
  isSystemOneServerError,
} from '../core/decision/providers/system-one';
import {
  JEV_DECIDE_TOOL_DESCRIPTOR_ID,
  JEV_DECIDE_TOOL_NAME,
  buildDecisionCandidates,
  createJevDecideToolDescriptors,
  executeJevDecideToolCall,
} from '../core/tool/jev-decide';
import type { ToolCall } from '../core/tool/types';

const LOCALE = 'en' as const;

function makeCall(payload: unknown, name = JEV_DECIDE_TOOL_NAME): ToolCall {
  return {
    name,
    invocationName: JEV_DECIDE_TOOL_NAME,
    raw: '',
    payload: (payload ?? {}) as Record<string, unknown>,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function systemOneResponse(answers: Record<string, unknown>, model = SYSTEM_ONE_FREE_MODEL): unknown {
  return { model, answers };
}

describe('jev tool descriptor', () => {
  it('declares one advisory tool with a closed input schema', () => {
    const [descriptor] = createJevDecideToolDescriptors(LOCALE);

    expect(descriptor.id).toBe(JEV_DECIDE_TOOL_DESCRIPTOR_ID);
    expect(descriptor.name).toBe(JEV_DECIDE_TOOL_NAME);
    expect(descriptor.invocationName).toBe(JEV_DECIDE_TOOL_NAME);
    expect(descriptor.inputSchema.required).toEqual(['state', 'questions']);
    expect(descriptor.inputSchema.additionalProperties).toBe(false);
    // The decision state leaves the browser, so this is a transmission and
    // must not be declared as a local low-risk read.
    expect(descriptor.execution.risk).toBe('medium');
    expect(descriptor.execution.mode).toBe('auto');
    // A local registration may only own in_process descriptors; the registry
    // rejects anything else, and the built-in web tools declare the same.
    expect(descriptor.provider.kind).toBe('local');
    expect(descriptor.provider.transport).toBe('in_process');
  });
});

describe('parseJevDecisionToolRequest', () => {
  it('accepts one choice, noul and score question over a shared state', () => {
    const parsed = parseJevDecisionToolRequest({
      state: '  A payment has failed for three days.  ',
      questions: [
        { id: 'team', type: 'choice', instructions: 'Who owns this?', criteria: { billing: 'payments', tech: 'bugs' } },
        { id: 'urgent', type: 'noul', instructions: 'Is this time sensitive?' },
        { id: 'severity', type: 'score', instructions: 'How bad?', criteria: ['low', 'high'] },
      ],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.state).toBe('A payment has failed for three days.');
    expect(parsed.request.questions).toHaveLength(3);
  });

  it('namespaces candidate ids by question so option ids stay unique', () => {
    expect(buildJevCandidateId('team', 'billing')).toBe('team:billing');
    expect(buildJevCandidateId('owner', 'billing')).toBe('owner:billing');
  });

  it('treats noul as the two-sided choice so one ranking vocabulary covers every type', () => {
    const noul: JevDecisionQuestionSpec = { id: 'q', type: 'noul', instructions: 'true?' };
    expect(listJevQuestionOptions(noul)).toEqual(['true', 'false']);
  });

  it.each([
    [{ questions: [] }, 'jev_invalid_state'],
    [{ state: 's', questions: 'nope' }, 'jev_invalid_questions'],
    [{ state: 's', questions: [] }, 'jev_empty_questions'],
    [{ state: 's', questions: [{ id: 'a', type: 'noul', instructions: 'i' }, { id: 'a', type: 'noul', instructions: 'i' }] }, 'jev_duplicate_question_id'],
    [{ state: 's', questions: [{ id: 'a', type: 'maybe', instructions: 'i' }] }, 'jev_unknown_question_type'],
    [{ state: 's', questions: [{ id: 'a', type: 'choice', instructions: 'i', criteria: {} }] }, 'jev_empty_criteria'],
    [{ state: 's', questions: [{ id: 'a', type: 'choice', instructions: 'i', criteria: { x: '' } }] }, 'jev_invalid_criterion'],
    [{ state: 's', questions: [{ id: 'a', type: 'score', instructions: 'i', criteria: [] }] }, 'jev_empty_score_criteria'],
    [{ state: 's', questions: [{ id: 'a', type: 'score', instructions: 'i' }] }, 'jev_invalid_score_criteria'],
    [{ state: 's', questions: [{ id: 'a', type: 'score', instructions: 'i', criteria: { low: 'x' } }] }, 'jev_invalid_score_criteria'],
    [{ state: 's', questions: [{ id: 'a', type: 'score', instructions: 'i', criteria: ['low', ''] }] }, 'jev_invalid_score_level'],
    [{ state: 's', questions: [{ id: 'a', type: 'noul' }] }, 'jev_invalid_instructions'],
  ])('rejects %j with a structured code instead of a default', (payload, code) => {
    const parsed = parseJevDecisionToolRequest(payload);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe(code);
    expect(parsed.message.length).toBeGreaterThan(0);
  });

  it('caps the state that may leave the browser', () => {
    const parsed = parseJevDecisionToolRequest({
      state: 'x'.repeat(8_001),
      questions: [{ id: 'a', type: 'noul', instructions: 'i' }],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe('jev_invalid_state');
  });
});

describe('parseJevDecisionAnswers', () => {
  const questions: JevDecisionQuestionSpec[] = [
    { id: 'team', type: 'choice', instructions: 'i', criteria: { billing: 'p', tech: 'b' } },
    { id: 'urgent', type: 'noul', instructions: 'i' },
    { id: 'severity', type: 'score', instructions: 'i', criteria: ['low', 'high'] },
  ];

  it('normalizes a typed answer per question', () => {
    const answers = parseJevDecisionAnswers(systemOneResponse({
      team: { type: 'choice', choice: 'billing', confidence: 0.9, probabilities: { billing: 0.9, tech: 0.1 } },
      urgent: { type: 'noul', noul: 0.98 },
      severity: { type: 'score', score: 1, confidence: 0.7, probabilities: { '0': 0, '1': 1 } },
    }), questions);

    expect(answers).toEqual({
      team: { type: 'choice', choice: 'billing', confidence: 0.9, probabilities: { billing: 0.9, tech: 0.1 } },
      urgent: { type: 'noul', noul: 0.98 },
      // A score answer is a rubric INDEX, not a 0..1 probability, and the
      // level it names is resolved against the criteria list.
      severity: {
        type: 'score',
        score: 1,
        confidence: 0.7,
        level: 'high',
        legend: undefined,
        probabilities: { '0': 0, '1': 1 },
      },
    });
  });

  it('resolves a rubric index to its label and keeps the legend', () => {
    const answers = parseJevDecisionAnswers(systemOneResponse({
      severity: {
        type: 'score',
        score: 2,
        confidence: 1,
        legend: { '0': 'can wait', '1': 'soon', '2': 'blocks a release' },
        probabilities: { '0': 0, '1': 0, '2': 1 },
      },
    }), [{ id: 'severity', type: 'score', instructions: 'i', criteria: ['can wait', 'soon', 'blocks a release'] }]);

    expect(answers?.severity).toEqual({
      type: 'score',
      score: 2,
      confidence: 1,
      level: 'blocks a release',
      legend: { '0': 'can wait', '1': 'soon', '2': 'blocks a release' },
      probabilities: { '0': 0, '1': 0, '2': 1 },
    });
  });

  it('rejects a score that is not a rubric index instead of clamping it', () => {
    const question: JevDecisionQuestionSpec[] = [
      { id: 'severity', type: 'score', instructions: 'i', criteria: ['low', 'high'] },
    ];
    // Out of range for a 2-entry rubric.
    expect(parseJevDecisionAnswers(systemOneResponse({ severity: { score: 7 } }), question)).toBeNull();
    // A probability is not an index; the endpoint answers an integer here.
    expect(parseJevDecisionAnswers(systemOneResponse({ severity: { score: 0.5 } }), question)).toBeNull();
  });

  it('drops a choice answer naming an option that was never offered', () => {
    const answers = parseJevDecisionAnswers(systemOneResponse({
      team: { type: 'choice', choice: 'legal', confidence: 0.9 },
    }), questions);

    expect(answers).toBeNull();
  });

  it('drops an out-of-range probability rather than clamping it', () => {
    const answers = parseJevDecisionAnswers(systemOneResponse({ urgent: { noul: 4 } }), questions);
    expect(answers).toBeNull();
  });

  it('returns null when the payload carries no answers at all', () => {
    expect(parseJevDecisionAnswers({ model: SYSTEM_ONE_FREE_MODEL }, questions)).toBeNull();
    expect(parseJevDecisionAnswers(null, questions)).toBeNull();
  });
});

describe('createSystemOneDecisionProvider', () => {
  const baseRequest = {
    kind: 'capability_relevance' as const,
    intent: 'A payment has failed for three days.',
    candidates: [],
    questions: [],
    typedQuestions: [
      { id: 'urgent', type: 'noul' as const, instructions: 'Is this time sensitive?' },
    ],
  };

  it('calls the free route unauthenticated and pins the model in the body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(systemOneResponse({ urgent: { noul: 0.98 } })));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SYSTEM_ONE_FREE_ENDPOINT);
    // The design is credential-free: no Authorization header may ever be sent.
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const body = JSON.parse(init.body as string) as {
      model: string;
      state: string;
      questions: Record<string, { type: string }>;
    };
    // The model must travel in the body: a request without it is not a valid
    // System One call, and a substituted model is a silent route change.
    expect(body.model).toBe(SYSTEM_ONE_FREE_MODEL);
    expect(body.state).toBe('A payment has failed for three days.');
    // `questions` is an object keyed by question id. An array is rejected by
    // the live endpoint with HTTP 422 "Input should be a valid dictionary",
    // so this assertion is the regression guard for that.
    expect(Array.isArray(body.questions)).toBe(false);
    expect(Object.keys(body.questions)).toEqual(['urgent']);
    expect(body.questions.urgent.type).toBe('noul');
    expect(result.ok).toBe(true);
    expect(result.modelAlias).toBe(SYSTEM_ONE_FREE_MODEL);
  });

  it('reports the model that actually answered, not the one that was requested', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(
      systemOneResponse({ urgent: { noul: 0.98 } }, 'jev-1.13-free-2026-05'),
    ));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(result.requestedModelAlias).toBe(SYSTEM_ONE_FREE_MODEL);
    expect(result.modelAlias).toBe('jev-1.13-free-2026-05');
  });

  it('does not attempt the paid route when its host permission is missing', async () => {
    // Without the second optional grant the fallback cannot work, and issuing
    // the request anyway would fail opaquely and look like an outage.
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'rate limited' }, 429));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => 'secret-key',
      hasPaidHostPermission: async () => false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe('system_one_status_429:paid_host_permission_missing');
  });

  it('treats a permission check that throws as not granted', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'rate limited' }, 429));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => 'secret-key',
      hasPaidHostPermission: async () => { throw new Error('api unavailable'); },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.fallbackReason).toBe('system_one_status_429:paid_host_permission_missing');
  });

  it('does not reach a second route when no key is configured', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'rate limited' }, 429));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.scores).toEqual([]);
    expect(result.fallbackReason).toBe('system_one_status_429:no_fallback_key');
  });

  it('falls back to TypeSafe with the stored key on a transient free failure', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(jsonResponse(systemOneResponse({ urgent: { noul: 0.4 } }, SYSTEM_ONE_TYPESAFE_MODEL)));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => 'secret-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [paidUrl, paidInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(paidUrl).toBe(SYSTEM_ONE_TYPESAFE_ENDPOINT);
    expect((paidInit.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
    expect(JSON.parse(paidInit.body as string).model).toBe(SYSTEM_ONE_TYPESAFE_MODEL);
    expect(result.ok).toBe(true);
    // The originally requested model stays visible for provenance.
    expect(result.requestedModelAlias).toBe(SYSTEM_ONE_FREE_MODEL);
    expect(result.modelAlias).toBe(SYSTEM_ONE_TYPESAFE_MODEL);
  });

  it('falls back on a 422 carrying a server error, which is what the live route returns when down', async () => {
    // This is the exact response the free route gave while it was unavailable,
    // so the fallback path is proven against a real outage shape.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        error: { error: { type: 'server_error', message: 'Upstream request failed: Endpoint is unavailable.' } },
      }, 422))
      .mockResolvedValueOnce(jsonResponse(systemOneResponse({ urgent: { noul: 0.7 } }, SYSTEM_ONE_TYPESAFE_MODEL)));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => 'secret-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.modelAlias).toBe(SYSTEM_ONE_TYPESAFE_MODEL);
  });

  it('does not switch providers on a request error even when a key is available', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: { type: 'invalid_request_error', message: 'questions must be a valid dictionary' },
    }, 422));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => 'secret-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    // Our own request is wrong; re-issuing it at another vendor would replace
    // that signal with someone else's error.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe('system_one_status_422');
  });

  it('reports a request error as non-transient', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad request' }, 422));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe('system_one_status_422');
  });

  it('reports unavailability without a key instead of pretending to answer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'gone' }, 404));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.selectedIds).toEqual([]);
    expect(result.scores).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it('resolves non-throwing on a transport failure so callers keep their fallback', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toContain('system_one_network_error');
  });

  it('classifies retryable statuses without treating 400/422 as availability', () => {
    expect(isRetryableSystemOneStatus(429)).toBe(true);
    expect(isRetryableSystemOneStatus(503)).toBe(true);
    expect(isRetryableSystemOneStatus(400)).toBe(false);
    expect(isRetryableSystemOneStatus(422)).toBe(false);
  });

  it('recognizes a server-side error body at either nesting depth', () => {
    // Observed live: with the free model down the endpoint answers 422 with a
    // nested server_error, so the status alone would misread it as a bad request.
    const observed = {
      error: { error: { type: 'server_error', message: 'Upstream request failed: Endpoint is unavailable.' } },
    };
    expect(isSystemOneServerError(observed)).toBe(true);
    expect(isSystemOneServerError({ error: { type: 'server_error' } })).toBe(true);
    expect(isSystemOneServerError({ type: 'overloaded_error' })).toBe(true);
    expect(isSystemOneServerError({ error: { type: 'invalid_request_error' } })).toBe(false);
    expect(isSystemOneServerError({ error: 'plain string' })).toBe(false);
    expect(isSystemOneServerError(null)).toBe(false);
  });

  it('classifies a 422 carrying a server error as transient', async () => {
    // Observed live: with the free model down the endpoint answers 422 with a
    // nested server_error. The status alone reads as a malformed request; the
    // body is the stronger fault signal, so the failure is transient and the
    // caller may retry later.
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: { error: { type: 'server_error', message: 'Upstream request failed: Endpoint is unavailable.' } },
    }, 422));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    // No key means the transient failure cannot be routed anywhere else, but
    // it is still reported as transient so the caller can retry later.
    expect(result.fallbackReason).toBe('system_one_server_error:no_fallback_key');
    expect(isRetryableSystemOneFailure(result)).toBe(true);
  });

  it('treats a 422 that is a real request error as non-transient', async () => {    const fetchImpl = vi.fn(async () => jsonResponse({
      error: { type: 'invalid_request_error', message: 'questions must be an object' },
    }, 422));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate(baseRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.fallbackReason).toBe('system_one_status_422');
    expect(isRetryableSystemOneFailure(result)).toBe(false);
  });

  it('rejects an answer the contract module would reject, instead of keeping a looser parser', async () => {
    // Regression: the provider used to carry its own answer parser with no
    // length bound, while the contract module bounds a choice id at 64 chars.
    // The synthesized criteria key below is questionId + ':' + optionId, so it
    // is 129 chars. The old split accepted it here and the tool then dropped
    // it, reporting a made-and-ranked decision as "no answers".
    const longQuestionId = 'q'.repeat(64);
    const longOptionId = 'o'.repeat(64);
    const longChoice = `${longQuestionId}:${longOptionId}`;
    const fetchImpl = vi.fn(async () => jsonResponse(systemOneResponse({
      [longQuestionId]: { type: 'choice', choice: longChoice, confidence: 0.9 },
    })));
    const provider = createSystemOneDecisionProvider({
      getApiKey: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.evaluate({
      kind: 'capability_relevance',
      intent: 'rank these',
      candidates: [{ id: longChoice, label: longOptionId }],
      questions: [{ id: longQuestionId, prompt: 'pick one', kind: 'capability_relevance' }],
    });

    // One authority for the response shape: the contract parser rejects the
    // oversized id, so the provider reports no usable answers.
    expect(result.ok).toBe(false);
    expect(result.scores).toEqual([]);
    expect(result.fallbackReason).toBe('empty_scores');
  });
});

describe('executeJevDecideToolCall', () => {
  beforeEach(() => {
    // The tool refuses to run without the optional host grant, so the default
    // test environment grants it. The ungranted case has its own test below.
    vi.stubGlobal('chrome', {
      permissions: { contains: vi.fn(async () => true) },
    });
  });

  function ungrantHostAccess() {
    vi.stubGlobal('chrome', {
      permissions: { contains: vi.fn(async () => false) },
    });
  }

  it('refuses to run when the optional host access is not granted', async () => {
    ungrantHostAccess();
    const route = vi.fn();

    const result = await executeJevDecideToolCall(makeCall({
      state: 'a state',
      questions: [{ id: 'urgent', type: 'noul', instructions: 'urgent?' }],
    }), LOCALE, { deps: { route: route as unknown as (request: RouteRequest) => never } });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('jev_host_permission_required');
    // The user must grant a permission; retrying on its own cannot help, and no
    // decision may be reported from a tool that never reached the network.
    expect(result.error?.retryable).toBe(false);
    expect(route).not.toHaveBeenCalled();
  });

  function routerOverFetch(fetchImpl: ReturnType<typeof vi.fn>) {
    const traceSink = createInMemoryTraceSink();
    const router = createDecisionRouter({
      provider: createSystemOneDecisionProvider({
        getApiKey: async () => null,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      traceSink,
    });
    return { route: router.route, traceSink };
  }

  const validPayload = {
    state: 'A payment has failed for three days.',
    questions: [
      { id: 'team', type: 'choice', instructions: 'Who owns this?', criteria: { billing: 'payments', tech: 'bugs' } },
      { id: 'urgent', type: 'noul', instructions: 'Is this time sensitive?' },
    ],
  };

  it('returns typed answers keyed by question id with the answering model', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(systemOneResponse({
      team: { type: 'choice', choice: 'billing', confidence: 0.99, probabilities: { billing: 0.99, tech: 0.01 } },
      urgent: { type: 'noul', noul: 0.98 },
    })));
    const { route, traceSink } = routerOverFetch(fetchImpl);

    const result = await executeJevDecideToolCall(makeCall(validPayload), LOCALE, { deps: { route } });

    expect(result.ok).toBe(true);
    const output = result.output as unknown as {
      model: string;
      answers: Record<string, { type: string }>;
      accepted: boolean;
    };
    expect(output.model).toBe(SYSTEM_ONE_FREE_MODEL);
    expect(output.answers.urgent).toEqual({ type: 'noul', noul: 0.98 });
    expect(output.answers.team.type).toBe('choice');
    expect(output.accepted).toBe(true);

    // The router records a bounded trace without persisting the raw state.
    const [trace] = traceSink.snapshot();
    expect(trace.surface).toBe('agent_decide');
    expect(trace.candidateIds).toContain('team:billing');
    expect(trace.intentPreview).toBe('A payment has failed for three days.');
  });

  it('rejects a malformed payload before any request is made', async () => {
    const route = vi.fn();
    const result = await executeJevDecideToolCall(
      makeCall({ state: '', questions: [] }),
      LOCALE,
      { deps: { route: route as unknown as (request: RouteRequest) => never } },
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('jev_invalid_state');
    expect(route).not.toHaveBeenCalled();
  });

  it('surfaces an unreachable endpoint as a retryable error, not a silent default', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const { route } = routerOverFetch(fetchImpl);

    const result = await executeJevDecideToolCall(makeCall(validPayload), LOCALE, { deps: { route } });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('jev_no_answers');
    expect(result.error?.retryable).toBe(true);
  });

  it('marks a request error non-retryable so the model does not loop on it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad request' }, 422));
    const { route } = routerOverFetch(fetchImpl);

    const result = await executeJevDecideToolCall(makeCall(validPayload), LOCALE, { deps: { route } });

    expect(result.ok).toBe(false);
    expect(result.error?.retryable).toBe(false);
  });

  it('refuses an unsupported tool name', async () => {
    const result = await executeJevDecideToolCall(makeCall(validPayload, 'jev_summarize'), LOCALE, {
      deps: { route: vi.fn() as unknown as (request: RouteRequest) => never },
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('jev_tool_unsupported');
  });

  it('returns a low-confidence answer without auto-accepting it', async () => {
    // Regression: passing policy: { minConfidence: 0 } overwrote the threshold
    // resolved in core/decision/policy.ts through the router's spread order,
    // so a decision the policy would never auto-approve was accepted.
    const fetchImpl = vi.fn(async () => jsonResponse(systemOneResponse({
      team: {
        type: 'choice',
        choice: 'billing',
        confidence: 0.25,
        probabilities: { billing: 0.25, tech: 0.25, legal: 0.25, other: 0.25 },
      },
    })));
    const { route } = routerOverFetch(fetchImpl);

    const result = await executeJevDecideToolCall(
      makeCall({
        state: 'a state',
        questions: [{
          id: 'team',
          type: 'choice',
          instructions: 'who owns this?',
          criteria: { billing: 'payments', tech: 'bugs', legal: 'contracts', other: 'none' },
        }],
      }),
      LOCALE,
      { deps: { route } },
    );

    const output = result.output as unknown as {
      answers: Record<string, { choice: string }>;
      accepted: boolean;
      threshold: number;
      confidence: number;
    };
    // The real distribution is still reported...
    expect(output.answers.team.choice).toBe('billing');
    expect(output.confidence).toBeCloseTo(0.25);
    // ...but read/low resolves to 0.35 and nothing crosses it, so the policy
    // layer refuses to auto-accept.
    expect(output.threshold).toBeCloseTo(0.35);
    expect(output.accepted).toBe(false);
  });

  it('accepts a confident negative noul, because the complement is a real answer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(systemOneResponse({
      urgent: { type: 'noul', noul: 0.1 },
    })));
    const { route } = routerOverFetch(fetchImpl);

    const result = await executeJevDecideToolCall(
      makeCall({ state: 'a state', questions: [{ id: 'urgent', type: 'noul', instructions: 'time sensitive?' }] }),
      LOCALE,
      { deps: { route } },
    );

    const output = result.output as unknown as { accepted: boolean };
    // noul 0.1 means "not time sensitive" at 0.9, so 'false' legitimately
    // clears the read/low threshold. Treating this as rejected would be the
    // bug, not the fix.
    expect(output.accepted).toBe(true);
  });
});

describe('buildDecisionCandidates', () => {
  it('flattens every question option into the shared ranking vocabulary', () => {
    const candidates = buildDecisionCandidates([
      { id: 'team', type: 'choice', instructions: 'i', criteria: { billing: 'payments', tech: 'bugs' } },
      { id: 'urgent', type: 'noul', instructions: 'i' },
      { id: 'severity', type: 'score', instructions: 'i', criteria: ['low', 'high'] },
    ]);

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'team:billing',
      'team:tech',
      'urgent:true',
      'urgent:false',
      'severity:low',
      'severity:high',
    ]);
    expect(candidates[0]?.description).toBe('payments');
  });
});
