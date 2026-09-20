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

  it('maps mcp_fanout into independent Noul questions and multi-selects above threshold', async () => {
    const provider = new TypeSafeJevDecisionProvider({
      async evaluate(payload) {
        expect(Object.keys(payload.questions)).toEqual(['fanout_c0', 'fanout_c1', 'fanout_c2']);
        expect(payload.questions.fanout_c0.type).toBe('noul');
        return {
          model: 'jev-fanout',
          answers: {
            fanout_c0: { type: 'noul', noul: 0.92 },
            fanout_c1: { type: 'noul', noul: 0.81 },
            fanout_c2: { type: 'noul', noul: 0.34 },
          },
        };
      },
    });

    const result = await provider.evaluate({
      requestId: 'fanout-1',
      purpose: 'mcp_fanout',
      intent: 'parallelize independent reads',
      confidenceThreshold: 0.75,
      candidates: [
        { id: 'a', name: 'read_a', title: 'Read A', description: 'Read A', risk: 'low' },
        { id: 'b', name: 'read_b', title: 'Read B', description: 'Read B', risk: 'low' },
        { id: 'c', name: 'read_c', title: 'Read C', description: 'Read C', risk: 'low' },
      ],
    });

    expect(result).toMatchObject({
      provider: 'typesafe-jev',
      model: 'jev-fanout',
      confidence: 0.81,
      selections: [
        { candidateId: 'a', confidence: 0.92, score: 0.92 },
        { candidateId: 'b', confidence: 0.81, score: 0.81 },
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
