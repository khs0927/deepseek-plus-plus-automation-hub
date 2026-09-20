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
  questions: {
    route: {
      type: 'choice';
      instructions: string;
      criteria: Record<string, string>;
    };
  };
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
    if (request.purpose !== 'mcp_rank') {
      throw new Error(`TypeSafeJevDecisionProvider does not support purpose: ${request.purpose}`);
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
    criteria.__none__ = 'None of the listed capabilities is relevant enough to the requested intent.';

    const response = await this.transport.evaluate({
      model: this.model,
      state: {
        intent: request.intent,
        candidates: stateCandidates,
      },
      questions: {
        route: {
          type: 'choice',
          instructions: [
            'Choose the capability that is most relevant to the user intent.',
            'Use only the supplied criteria keys.',
            'Choose __none__ when no candidate is sufficiently relevant.',
            'Do not infer permission or authorization; this is relevance ranking only.',
          ].join(' '),
          criteria,
        },
      },
    }, signal);

    return decodeSystemOneRanking(response, optionToCandidate, this.id, this.model);
  }
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
