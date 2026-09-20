import type {
  DecisionCandidate,
  DecisionRequest,
  DecisionResult,
} from './contract';
import type { DecisionProvider } from './provider';

export interface TypeSafeSystemOneTransport {
  evaluate(
    payload: TypeSafeSystemOneRequest,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export interface TypeSafeSystemOneRequest {
  model: string;
  state: {
    intent: string;
    candidates: Array<{
      key: string;
      name: string;
      title: string;
      description: string;
      provider?: string;
      risk?: string;
    }>;
  };
  questions: Record<string, {
    type: 'choice' | 'noul';
    instructions: string;
    criteria: Record<string, string>;
  }>;
}

export class TypeSafeJevDecisionProvider implements DecisionProvider {
  readonly id = 'typesafe-jev';

  constructor(
    private readonly transport: TypeSafeSystemOneTransport,
    private readonly model = 'jev-latest',
  ) {}

  async evaluate(
    request: DecisionRequest,
    signal?: AbortSignal,
  ): Promise<DecisionResult> {
    if (request.purpose === 'mcp_fanout') {
      return this.evaluateFanout(request, signal);
    }
    if (request.candidates.length === 0) {
      return {
        provider: this.id,
        model: this.model,
        confidence: 0,
        selections: [],
        escalated: true,
        escalationReason: 'unsure',
      };
    }
    if (request.candidates.length > 254) {
      throw new Error('Jev MCP ranking accepts at most 254 real candidates plus one reserved abstain option.');
    }

    const optionToCandidate = new Map<string, DecisionCandidate>();
    const criteria: Record<string, string> = {};
    const stateCandidates = request.candidates.map((candidate, index) => {
      const key = `c${index}`;
      optionToCandidate.set(key, candidate);
      criteria[key] = buildCriterion(candidate);
      return {
        key,
        name: candidate.name,
        title: candidate.title,
        description: candidate.description,
        ...(candidate.provider ? { provider: candidate.provider } : {}),
        ...(candidate.risk ? { risk: candidate.risk } : {}),
      };
    });

    // Reserve one option so the provider can abstain instead of forcing a poor
    // route. The application still owns the final confidence policy.
    criteria.__none__ = buildAbstainCriterion(request.purpose);

    const response = await this.transport.evaluate({
      model: this.model,
      state: {
        intent: request.intent,
        candidates: stateCandidates,
      },
      questions: {
        route: {
          type: 'choice',
          instructions: buildQuestionInstructions(request.purpose),
          criteria,
        },
      },
    }, signal);

    return decodeSystemOneRanking(response, optionToCandidate, this.id, this.model);
  }

  private async evaluateFanout(
    request: DecisionRequest,
    signal?: AbortSignal,
  ): Promise<DecisionResult> {
    if (request.candidates.length === 0) {
      return {
        provider: this.id,
        model: this.model,
        confidence: 0,
        selections: [],
        escalated: true,
        escalationReason: 'unsure',
      };
    }
    if (request.candidates.length > 64) {
      throw new Error('Jev MCP fan-out accepts at most 64 deterministic-safe candidates per evaluation.');
    }

    const optionToCandidate = new Map<string, DecisionCandidate>();
    const stateCandidates = request.candidates.map((candidate, index) => {
      const key = `c${index}`;
      optionToCandidate.set(key, candidate);
      return {
        key,
        name: candidate.name,
        title: candidate.title,
        description: candidate.description,
        ...(candidate.provider ? { provider: candidate.provider } : {}),
        ...(candidate.risk ? { risk: candidate.risk } : {}),
      };
    });
    const questions = Object.fromEntries(
      stateCandidates.map((candidate) => [
        `fanout_${candidate.key}`,
        {
          type: 'noul' as const,
          instructions: [
            'Estimate whether this already deterministic-safe MCP call should participate in the same parallel fan-out for the supplied intent.',
            'Judge semantic relevance and likely independence only.',
            'Do not grant permission, do not override runtime safety, and answer low when ordering or dependency is plausible.',
            `Candidate: ${candidate.title}. ${candidate.description}`,
          ].join(' '),
          criteria: {
            true: 'This candidate is relevant and plausibly independent enough to run concurrently with other deterministic-safe candidates.',
            false: 'This candidate should remain serial because relevance or independence is uncertain.',
          },
        },
      ]),
    );

    const response = await this.transport.evaluate({
      model: this.model,
      state: {
        intent: request.intent,
        candidates: stateCandidates,
      },
      questions,
    }, signal);

    return decodeSystemOneFanout(
      response,
      optionToCandidate,
      request.confidenceThreshold ?? 0.75,
      this.id,
      this.model,
    );
  }
}

function decodeSystemOneFanout(
  raw: unknown,
  optionToCandidate: ReadonlyMap<string, DecisionCandidate>,
  threshold: number,
  providerId: string,
  requestedModel: string,
): DecisionResult {
  const response = requireRecord(raw, 'response');
  const answers = requireRecord(response.answers, 'response.answers');
  const scored = [...optionToCandidate.entries()].map(([key, candidate]) => {
    const answer = requireRecord(
      answers[`fanout_${key}`],
      `response.answers.fanout_${key}`,
    );
    if (answer.type !== undefined && answer.type !== 'noul') {
      throw new Error(`TypeSafe System One fan-out answer has invalid type for ${key}.`);
    }
    const probability = requireProbability(
      answer.noul,
      `response.answers.fanout_${key}.noul`,
    );
    return {
      candidateId: candidate.id,
      confidence: probability,
      score: probability,
    };
  });

  const selections = scored
    .filter((selection) => selection.confidence >= threshold)
    .sort((left, right) => right.confidence - left.confidence);
  const confidence = selections.length > 0
    ? Math.min(...selections.map((selection) => selection.confidence))
    : Math.max(0, 1 - Math.max(...scored.map((selection) => selection.confidence), 0));

  return {
    provider: providerId,
    model: typeof response.model === 'string' && response.model.trim()
      ? response.model
      : requestedModel,
    confidence,
    selections,
    ...(selections.length === 0
      ? { escalated: true as const, escalationReason: 'unsure' as const }
      : {}),
  };
}

function decodeSystemOneRanking(
  raw: unknown,
  optionToCandidate: ReadonlyMap<string, DecisionCandidate>,
  providerId: string,
  requestedModel: string,
): DecisionResult {
  const response = requireRecord(raw, 'response');
  const answers = requireRecord(response.answers, 'response.answers');
  const route = requireRecord(answers.route, 'response.answers.route');
  const probabilities = requireRecord(route.probabilities, 'response.answers.route.probabilities');
  const confidence = requireProbability(route.confidence, 'response.answers.route.confidence');
  const selectedKey = typeof route.choice === 'string' ? route.choice : null;
  if (!selectedKey || (selectedKey !== '__none__' && !optionToCandidate.has(selectedKey))) {
    throw new Error('TypeSafe System One returned an unknown route choice.');
  }

  const ranked = Object.entries(probabilities)
    .filter(([key]) => key !== '__none__' && optionToCandidate.has(key))
    .map(([key, probability]) => ({
      candidateId: optionToCandidate.get(key)!.id,
      confidence: requireProbability(probability, `response.answers.route.probabilities.${key}`),
      score: requireProbability(probability, `response.answers.route.probabilities.${key}`),
    }))
    .sort((left, right) => right.score - left.score);

  if (probabilities.__none__ !== undefined) {
    requireProbability(probabilities.__none__, 'response.answers.route.probabilities.__none__');
  }
  const abstained = selectedKey === '__none__';

  return {
    provider: providerId,
    model: typeof response.model === 'string' && response.model.trim()
      ? response.model
      : requestedModel,
    confidence,
    selections: abstained ? [] : ranked,
    ...(abstained ? { escalated: true as const, escalationReason: 'unsure' as const } : {}),
  };
}

function buildQuestionInstructions(purpose: DecisionRequest['purpose']): string {
  switch (purpose) {
    case 'result_judge':
      return [
        'Choose the best outcome action using only the supplied execution evidence.',
        'Do not claim external truth that is not present in the evidence.',
        'Use retry only when repeating the same operation is plausibly useful.',
        'Use escalate for ambiguity, conflict, truncation, or when stronger reasoning is needed.',
        'Use only the supplied criteria keys and choose __none__ when evidence is insufficient.',
      ].join(' ');
    case 'skill_rank':
      return 'Choose the skill most relevant to the requested intent. Use only supplied criteria keys and choose __none__ when none is relevant enough.';
    case 'agent_route':
      return 'Choose the agent capability best suited to the requested intent. Do not infer execution permission. Use __none__ when no candidate is suitable.';
    case 'model_route':
      return 'Choose the model capability best suited to the requested intent from the supplied criteria. Use __none__ when evidence is insufficient.';
    case 'mcp_rank':
    default:
      return [
        'Choose the capability that is most relevant to the user intent.',
        'Use only the supplied criteria keys.',
        'Choose __none__ when no candidate is sufficiently relevant.',
        'Do not infer permission or authorization; this is relevance ranking only.',
      ].join(' ');
  }
}

function buildAbstainCriterion(purpose: DecisionRequest['purpose']): string {
  return purpose === 'result_judge'
    ? 'The supplied execution evidence is insufficient to choose accept, retry, or escalate confidently.'
    : 'None of the listed capabilities is relevant enough to the requested intent.';
}

function buildCriterion(candidate: DecisionCandidate): string {
  const parts = [
    candidate.title,
    candidate.description,
    candidate.provider ? `Provider: ${candidate.provider}.` : '',
    candidate.risk ? `Declared runtime risk: ${candidate.risk}.` : '',
  ].filter(Boolean);
  return parts.join(' ').slice(0, 1_200);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid TypeSafe System One response at ${path}.`);
  }
  return value as Record<string, unknown>;
}

function requireProbability(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid probability at ${path}.`);
  }
  return value;
}
