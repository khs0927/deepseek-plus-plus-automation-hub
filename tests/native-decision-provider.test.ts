import { describe, expect, it, vi } from 'vitest';
import {
  evaluateDecisionRequest,
  getDecisionStatus,
} from '../packages/shell-host/native/decision-provider.mjs';

describe('Native TypeSafe decision provider', () => {
  it('defaults to unconfigured shadow mode without exposing a secret', () => {
    expect(getDecisionStatus({})).toEqual({
      configured: false,
      provider: 'typesafe',
      model: 'jev-latest',
      mode: 'shadow',
    });
  });

  it('accepts explicit active mode and a bounded model identifier', () => {
    expect(getDecisionStatus({
      TYPESAFE_API_KEY: 'test-key',
      TYPESAFE_JEV_MODEL: 'jev-test',
      DEEPSEEK_PP_JEV_MODE: 'active',
    })).toEqual({
      configured: true,
      provider: 'typesafe',
      model: 'jev-test',
      mode: 'active',
    });
  });

  it('builds the authenticated System One request inside the Native Host boundary', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.typesafe.ai/v1/systemone');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(String(init.body))).toEqual({
        state: {
          intent: 'delegate independent coding reviews',
          candidates: [{ key: 'c0', name: 'invoke_subagent_batch' }],
        },
        model: 'jev-latest',
        questions: {
          route: {
            type: 'choice',
            criteria: {
              c0: 'Use the subagent batch capability.',
              __none__: 'No capability.',
            },
          },
        },
      });
      return new Response(JSON.stringify({
        model: 'jev-test',
        answers: {
          route: {
            type: 'choice',
            choice: 'c0',
            probabilities: { c0: 0.98, __none__: 0.02 },
            confidence: 0.98,
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const logLine = vi.fn();
    const result = await evaluateDecisionRequest({
      request: {
        state: {
          intent: 'delegate independent coding reviews',
          candidates: [{ key: 'c0', name: 'invoke_subagent_batch' }],
        },
        model: 'jev-latest',
        questions: {
          route: {
            type: 'choice',
            criteria: {
              c0: 'Use the subagent batch capability.',
              __none__: 'No capability.',
            },
          },
        },
      },
    }, {
      env: { TYPESAFE_API_KEY: 'test-key' },
      fetchImpl,
      logLine,
      timeoutMs: 2_000,
    });

    expect(result).toMatchObject({
      model: 'jev-test',
      answers: {
        route: {
          choice: 'c0',
          confidence: 0.98,
        },
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logLine).toHaveBeenCalledTimes(1);
    expect(String(logLine.mock.calls[0]?.[0])).not.toContain('test-key');
    expect(String(logLine.mock.calls[0]?.[0])).not.toContain('delegate independent coding reviews');
  });

  it('fails closed before network access when the API key is absent', async () => {
    const fetchImpl = vi.fn();
    await expect(evaluateDecisionRequest({
      request: {
        state: {},
        model: 'jev-latest',
        questions: { route: { type: 'choice', criteria: { a: 'A' } } },
      },
    }, {
      env: {},
      fetchImpl,
    })).rejects.toThrow('TYPESAFE_API_KEY');

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
