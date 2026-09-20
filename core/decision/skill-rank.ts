import type { Skill } from '../types';
import { isLocalIndexInstructions } from '../skill/local-importer';
import {
  isImplicitSkillActivationCandidate,
  rankImplicitSkillCandidates,
  selectImplicitSkillFromRanking,
  type LocalSkillIndex,
} from '../skill/local-skill-scorer';
import { evaluateDecision, getDecisionRuntimeConfig } from './provider';
import { sanitizeDecisionText } from './sanitize';
import { decisionTraceBuffer } from './trace';

const SKILL_RANK_CANDIDATE_LIMIT = 16;
const SKILL_RANK_CONFIDENCE_THRESHOLD = 0.80;

export interface ImplicitSkillSelection {
  name: string;
  skillDir: string;
}

export interface ImplicitSkillDecisionResult {
  selection: ImplicitSkillSelection | null;
  source: 'lexical' | 'jev';
  confidence?: number;
}

export async function rankImplicitSkillWithDecision(
  query: string,
  skills: readonly Skill[],
  signal?: AbortSignal,
): Promise<ImplicitSkillDecisionResult> {
  const localSkills = skills
    .filter(isDecisionEligibleLocalSkill)
    .map(toLocalSkillIndex);
  const ranked = rankImplicitSkillCandidates(
    query,
    localSkills,
    SKILL_RANK_CANDIDATE_LIMIT,
  );
  const lexical = toSelection(selectImplicitSkillFromRanking(ranked));
  const plausible = ranked.filter(isImplicitSkillActivationCandidate);

  if (plausible.length < 2) {
    return { selection: lexical, source: 'lexical' };
  }

  const runtime = getDecisionRuntimeConfig();
  if (runtime.mode === 'disabled' || !runtime.provider) {
    return { selection: lexical, source: 'lexical' };
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const candidateMap = new Map<string, LocalSkillIndex>();
  const candidates = plausible.map((entry, index) => {
    const id = `skill:${index}`;
    candidateMap.set(id, entry.skill);
    return {
      id,
      name: sanitizeDecisionText(entry.skill.name, 160),
      title: sanitizeDecisionText(entry.skill.name, 240),
      description: sanitizeDecisionText(
        [
          entry.skill.description,
          `Local relevance score: ${entry.score}.`,
          entry.skill.instructions
            ? `Index guidance: ${entry.skill.instructions}`
            : '',
        ].filter(Boolean).join(' '),
        900,
      ),
      provider: 'local-skill',
      risk: 'low',
    } as const;
  });

  try {
    const result = await evaluateDecision({
      requestId,
      purpose: 'skill_rank',
      intent: sanitizeDecisionText(query, 2_000),
      candidates,
      confidenceThreshold: SKILL_RANK_CONFIDENCE_THRESHOLD,
    }, signal);

    const selectedId = result.selections[0]?.candidateId;
    const selectedSkill = selectedId ? candidateMap.get(selectedId) : undefined;
    const providerAccepted = (
      result.escalated !== true &&
      result.confidence >= SKILL_RANK_CONFIDENCE_THRESHOLD &&
      selectedSkill !== undefined
    );
    const applied = runtime.mode === 'active' && providerAccepted;

    decisionTraceBuffer.record({
      requestId,
      purpose: 'skill_rank',
      mode: runtime.mode,
      provider: result.provider || runtime.provider.id,
      ...(result.model ? { model: result.model } : {}),
      candidateIds: candidates.map((candidate) => candidate.id),
      selectedIds: selectedId && selectedSkill ? [selectedId] : [],
      confidence: result.confidence,
      threshold: SKILL_RANK_CONFIDENCE_THRESHOLD,
      ...(!providerAccepted
        ? {
          fallbackReason: result.escalationReason ?? (
            result.confidence < SKILL_RANK_CONFIDENCE_THRESHOLD
              ? 'low_confidence'
              : 'no_selection'
          ),
        }
        : {}),
      latencyMs: Date.now() - startedAt,
      applied,
    });

    if (!applied) {
      return {
        selection: lexical,
        source: 'lexical',
        confidence: result.confidence,
      };
    }

    return {
      selection: toSelection(selectedSkill),
      source: 'jev',
      confidence: result.confidence,
    };
  } catch {
    decisionTraceBuffer.record({
      requestId,
      purpose: 'skill_rank',
      mode: runtime.mode,
      provider: runtime.provider.id,
      candidateIds: candidates.map((candidate) => candidate.id),
      selectedIds: [],
      threshold: SKILL_RANK_CONFIDENCE_THRESHOLD,
      fallbackReason: 'provider_error',
      latencyMs: Date.now() - startedAt,
      applied: false,
    });
    return { selection: lexical, source: 'lexical' };
  }
}

function isDecisionEligibleLocalSkill(skill: Skill): boolean {
  return (
    skill.enabled !== false &&
    skill.remote?.provider === 'local' &&
    isLocalIndexInstructions(skill.instructions)
  );
}

function toLocalSkillIndex(skill: Skill): LocalSkillIndex {
  return {
    name: skill.name,
    description: skill.description ?? '',
    skillDir: skill.remote?.localDirectory ?? '',
    instructions: skill.instructions,
  };
}

function toSelection(skill: LocalSkillIndex | undefined | null): ImplicitSkillSelection | null {
  if (!skill) return null;
  return {
    name: skill.name,
    skillDir: skill.skillDir,
  };
}
