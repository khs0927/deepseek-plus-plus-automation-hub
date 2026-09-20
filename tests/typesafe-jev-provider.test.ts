import { describe, expect, it } from 'vitest';
import { TypeSafeJevDecisionProvider } from '../core/decision/typesafe-jev-provider';

describe('TypeSafeJevDecisionProvider', () => {
  it('maps Choice probabilities into a deterministic candidate ranking', async () => {
    const provider = new TypeSafeJevDecisionProvider({
      async evaluate(payload) {
        expect(payload.model).toBe('jev-latest');
        expect(Object.keys(payload.questions.route.criteria)).toEqual(['c0', 'c1', '__none__']);
        return {
          model: 'jev-1.13.0',
          answers: {
            route: {
              type: 'choice',
              choice: 'c1',
              probabilities: {
                c0: 0.15,
                c1: 0.80,
                __none__: 0.05,
              },
              confidence: 0.80,
            },
          },
        };
      },
    });

    const result = await provider.evaluate({
      requestId: 'req-1',
      purpose: 'mcp_rank',
      intent: 'update repository files',
      candidates: [
        {
          id: 'search',
          name: 'search',
          title: 'Search',
          description: 'Search public web content.',
          provider: 'web',
          risk: 'low',
        },
        {
          id: 'github',
          name: 'github_update',
          title: 'GitHub update',
          description: 'Update repository files.',
          provider: 'github',
          risk: 'medium',
        },
      ],
    });

    expect(result).toMatchObject({
      provider: 'typesafe-jev',
      model: 'jev-1.13.0',
      confidence: 0.80,
      selections: [
        { candidateId: 'github', confidence: 0.80, score: 0.80 },
        { candidateId: 'search', confidence: 0.15, score: 0.15 },
      ],
    });
  });

  it('maps result_judge into evidence-bounded outcome actions', async () => {
    const provider = new TypeSafeJevDecisionProvider({
      async evaluate(payload) {
        expect(payload.questions.route.instructions).toContain('supplied execution evidence');
        expect(Object.keys(payload.questions.route.criteria)).toEqual([
          'c0',
          'c1',
          'c2',
          '__none__',
        ]);
        return {
          model: 'jev-judge',
          answers: {
            route: {
              type: 'choice',
              choice: 'c2',
              probabilities: {
                c0: 0.10,
                c1: 0.15,
                c2: 0.70,
                __none__: 0.05,
              },
              confidence: 0.70,
            },
          },
        };
      },
    });

    const result = await provider.evaluate({
      requestId: 'judge-1',
      purpose: 'result_judge',
      intent: 'Tool result is truncated and evidence is ambiguous.',
      candidates: [
        { id: 'accept', name: 'accept', title: 'Accept', description: 'Accept the result.' },
        { id: 'retry', name: 'retry', title: 'Retry', description: 'Retry the same operation.' },
        { id: 'escalate', name: 'escalate', title: 'Escalate', description: 'Escalate for stronger reasoning.' },
      ],
    });

    expect(result.selections[0]).toMatchObject({
      candidateId: 'escalate',
      confidence: 0.70,
    });
  });

  it('turns the reserved none option into an abstaining escalation', async () => {
    const provider = new TypeSafeJevDecisionProvider({
      async evaluate() {
        return {
          model: 'jev-1.13.0',
          answers: {
            route: {
              type: 'choice',
              choice: '__none__',
              probabilities: {
                c0: 0.10,
                __none__: 0.90,
              },
              confidence: 0.90,
            },
          },
        };
      },
    });

    const result = await provider.evaluate({
      requestId: 'req-2',
      purpose: 'mcp_rank',
      intent: 'unrelated request',
      candidates: [{
        id: 'github',
        name: 'github_update',
        title: 'GitHub update',
        description: 'Update repository files.',
        provider: 'github',
        risk: 'medium',
      }],
    });

    expect(result).toMatchObject({
      selections: [],
      escalated: true,
      escalationReason: 'unsure',
    });
  });
});
