import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_INDEX_MARKER } from '../core/skill/local-importer';
import { MockDecisionProvider } from '../core/decision/mock-provider';
import {
  configureDecisionRuntime,
  resetDecisionRuntimeForTests,
} from '../core/decision/provider';
import { rankImplicitSkillWithDecision } from '../core/decision/skill-rank';
import { decisionTraceBuffer } from '../core/decision/trace';
import type { Skill } from '../core/types';

afterEach(() => {
  resetDecisionRuntimeForTests();
  decisionTraceBuffer.clear();
});

describe('JEV implicit Skill rerank', () => {
  it('resolves an ambiguous lexical shortlist in active mode', async () => {
    const skills = [
      localSkill('weekly-a', 'Generate weekly report and summary', '/skills/a'),
      localSkill('weekly-b', 'Generate weekly report and summary', '/skills/b'),
    ];

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider((request) => {
        expect(request.purpose).toBe('skill_rank');
        expect(request.candidates).toHaveLength(2);
        return {
          provider: 'mock',
          confidence: 0.94,
          selections: [
            { candidateId: request.candidates[1]!.id, confidence: 0.94 },
          ],
        };
      }),
    });

    const result = await rankImplicitSkillWithDecision('weekly report', skills);

    expect(result).toEqual({
      selection: { name: 'weekly-b', skillDir: '/skills/b' },
      source: 'jev',
      confidence: 0.94,
    });
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      purpose: 'skill_rank',
      applied: true,
    });
  });

  it('keeps released lexical behavior in shadow mode', async () => {
    const skills = [
      localSkill('weekly-a', 'Generate weekly report and summary', '/skills/a'),
      localSkill('weekly-b', 'Generate weekly report and summary', '/skills/b'),
    ];

    configureDecisionRuntime({
      mode: 'shadow',
      provider: new MockDecisionProvider((request) => ({
        provider: 'mock',
        confidence: 0.99,
        selections: [
          { candidateId: request.candidates[1]!.id, confidence: 0.99 },
        ],
      })),
    });

    const result = await rankImplicitSkillWithDecision('weekly report', skills);

    // The lexical scorer sees a tie and therefore refuses implicit activation.
    expect(result).toEqual({
      selection: null,
      source: 'lexical',
      confidence: 0.99,
    });
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      applied: false,
    });
  });

  it('never exposes below-threshold Skills to JEV', async () => {
    const skills = [
      localSkill('weekly-a', 'Generate weekly report and summary', '/skills/a'),
      localSkill('weekly-b', 'Generate weekly report and summary', '/skills/b'),
      localSkill('weather', 'Weather warnings and forecasts', '/skills/weather'),
    ];

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider((request) => {
        expect(request.candidates).toHaveLength(2);
        expect(request.candidates.map((candidate) => candidate.name))
          .not.toContain('weather');
        return {
          provider: 'mock',
          confidence: 0.92,
          selections: [
            { candidateId: request.candidates[0]!.id, confidence: 0.92 },
          ],
        };
      }),
    });

    const result = await rankImplicitSkillWithDecision('weekly report', skills);
    expect(result.selection?.name).toBe('weekly-a');
  });

  it('falls back to lexical selection on provider failure', async () => {
    const skills = [
      localSkill('weekly-report', 'Generate weekly report and summary', '/skills/a'),
      localSkill('report-helper', 'Generate report summaries', '/skills/b'),
    ];

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => {
        throw new Error('provider unavailable');
      }),
    });

    const result = await rankImplicitSkillWithDecision('weekly report', skills);
    expect(result.source).toBe('lexical');
    expect(result.selection?.name).toBe('weekly-report');
  });
});

function localSkill(name: string, description: string, dir: string): Skill {
  return {
    name,
    description,
    instructions: [
      '# Local Skill',
      `- ${LOCAL_INDEX_MARKER}`,
      `- Skill directory path: ${dir}`,
    ].join('\n'),
    enabled: true,
    memoryEnabled: false,
    source: 'remote',
    remote: {
      provider: 'local',
      localDirectory: dir,
      localRootPath: dir,
    },
  } as unknown as Skill;
}
