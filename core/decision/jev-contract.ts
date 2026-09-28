// JEV Decision Plane - agent-facing System One question contract.
//
// This module is a pure contract: it imports no browser, DOM, provider or
// entrypoint implementation, so both the tool boundary and a DecisionProvider
// can depend on it without binding to a concrete transport.
//
// Jev answers narrow typed questions about one shared state. It is not a chat
// model: it never writes prose, code or tools, and a Decision derived from it
// is never authorization. Runtime code still owns authorization, execution and
// outcome verification (see ./types.ts).

export const JEV_DECISION_QUESTION_TYPES = ['choice', 'noul', 'score'] as const;

export type JevDecisionQuestionType = typeof JEV_DECISION_QUESTION_TYPES[number];

/**
 * Bounds. The decision state is model-authored free text that leaves the
 * browser to a third-party endpoint, so every field is capped before it is
 * forwarded. These are the single authority for those caps.
 */
export const JEV_MAX_STATE_CHARS = 8_000;
export const JEV_MAX_QUESTIONS = 8;
export const JEV_MAX_CRITERIA = 12;
export const JEV_MAX_SCORE_LEVELS = 8;
export const JEV_MAX_QUESTION_ID_CHARS = 64;
export const JEV_MAX_INSTRUCTION_CHARS = 1_000;
export const JEV_MAX_OPTION_CHARS = 400;

interface JevQuestionBase {
  id: string;
  instructions: string;
}

/** Pick exactly one option; returns a distribution over the option ids. */
export interface JevChoiceQuestionSpec extends JevQuestionBase {
  type: 'choice';
  criteria: Record<string, string>;
}

/** Is this one statement true; returns a probability, not an intensity. */
export interface JevNoulQuestionSpec extends JevQuestionBase {
  type: 'noul';
}

/** Position on an ordered rubric. */
export interface JevScoreQuestionSpec extends JevQuestionBase {
  type: 'score';
  /**
   * Ordered rubric labels, lowest first.
   *
   * The wire field is `criteria` and it is a LIST, even for `score` (a
   * `choice` question sends an object). Verified against the live endpoint:
   * `levels` is rejected with HTTP 422 `Field required`, and an object-valued
   * `criteria` is rejected with `Input should be a valid list`.
   */
  criteria: readonly string[];
}

export type JevDecisionQuestionSpec =
  | JevChoiceQuestionSpec
  | JevNoulQuestionSpec
  | JevScoreQuestionSpec;

export interface JevDecisionToolRequest {
  state: string;
  questions: readonly JevDecisionQuestionSpec[];
}

export type JevDecisionToolRequestParseResult =
  | { ok: true; request: JevDecisionToolRequest }
  | { ok: false; code: string; message: string };

export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevNoulAnswer {
  type: 'noul';
  noul: number;
}

export interface JevScoreAnswer {
  type: 'score';
  /**
   * Index into the ordered criteria list. This is an integer position, NOT a
   * 0..1 probability: verified live, the endpoint answers `"score": 2` for the
   * third rubric entry.
   */
  score: number;
  confidence: number;
  /** The rubric label `score` resolved to. */
  level: string;
  legend?: Record<string, string>;
  /** Distribution keyed by the criteria index rendered as a string. */
  probabilities?: Record<string, number>;
}

export type JevDecisionAnswer = JevChoiceAnswer | JevNoulAnswer | JevScoreAnswer;

/**
 * The option ids a question resolves to. `noul` is the two-sided case of a
 * choice, so it is expressed the same way; this keeps one ranking vocabulary
 * for every question type instead of a per-type special case.
 */
export function listJevQuestionOptions(question: JevDecisionQuestionSpec): readonly string[] {
  if (question.type === 'choice') return Object.keys(question.criteria);
  if (question.type === 'score') return [...question.criteria];
  return ['true', 'false'];
}

/**
 * Candidate id for one option of one question.
 *
 * Option ids are only unique inside their question, so the ranking vocabulary
 * namespaces them. Tool and provider share this one convention instead of each
 * inventing an id scheme the other has to guess.
 */
export function buildJevCandidateId(questionId: string, optionId: string): string {
  return `${questionId}:${optionId}`;
}

/**
 * Parse and bound an untrusted tool payload into the decision request.
 *
 * Returns a structured error instead of throwing: a malformed model-authored
 * payload is an expected outcome at this boundary, and the caller turns it
 * into a visible tool error rather than a silent default.
 */
export function parseJevDecisionToolRequest(raw: unknown): JevDecisionToolRequestParseResult {
  if (!isRecord(raw)) {
    return fail('jev_invalid_payload', 'jev_decide requires an object payload');
  }

  const state = readBoundedString(raw.state, JEV_MAX_STATE_CHARS);
  if (state === null) {
    return fail('jev_invalid_state', `state must be a non-empty string of at most ${JEV_MAX_STATE_CHARS} characters`);
  }

  if (!Array.isArray(raw.questions)) {
    return fail('jev_invalid_questions', 'questions must be an array');
  }
  if (raw.questions.length === 0) {
    return fail('jev_empty_questions', 'at least one question is required');
  }
  if (raw.questions.length > JEV_MAX_QUESTIONS) {
    return fail('jev_too_many_questions', `at most ${JEV_MAX_QUESTIONS} questions are allowed`);
  }

  const questions: JevDecisionQuestionSpec[] = [];
  const seenIds = new Set<string>();

  for (const entry of raw.questions) {
    const parsed = parseQuestion(entry);
    if (!parsed.ok) return parsed;
    if (seenIds.has(parsed.question.id)) {
      return fail('jev_duplicate_question_id', `duplicate question id: ${parsed.question.id}`);
    }
    seenIds.add(parsed.question.id);
    questions.push(parsed.question);
  }

  return { ok: true, request: { state, questions } };
}

function parseQuestion(
  raw: unknown,
): { ok: true; question: JevDecisionQuestionSpec } | { ok: false; code: string; message: string } {
  if (!isRecord(raw)) {
    return fail('jev_invalid_question', 'each question must be an object');
  }

  const id = readBoundedString(raw.id, JEV_MAX_QUESTION_ID_CHARS);
  if (id === null) {
    return fail('jev_invalid_question_id', `question id must be a non-empty string of at most ${JEV_MAX_QUESTION_ID_CHARS} characters`);
  }

  const instructions = readBoundedString(raw.instructions, JEV_MAX_INSTRUCTION_CHARS);
  if (instructions === null) {
    return fail('jev_invalid_instructions', `question "${id}" needs non-empty instructions of at most ${JEV_MAX_INSTRUCTION_CHARS} characters`);
  }

  if (raw.type === 'noul') {
    return { ok: true, question: { id, type: 'noul', instructions } };
  }

  if (raw.type === 'choice') {
    if (!isRecord(raw.criteria)) {
      return fail('jev_invalid_criteria', `question "${id}" requires a criteria object`);
    }
    const entries = Object.entries(raw.criteria);
    if (entries.length === 0) {
      return fail('jev_empty_criteria', `question "${id}" requires at least one criterion`);
    }
    if (entries.length > JEV_MAX_CRITERIA) {
      return fail('jev_too_many_criteria', `question "${id}" allows at most ${JEV_MAX_CRITERIA} criteria`);
    }
    const criteria: Record<string, string> = {};
    for (const [optionId, description] of entries) {
      const boundedOptionId = readBoundedString(optionId, JEV_MAX_QUESTION_ID_CHARS);
      const boundedDescription = readBoundedString(description, JEV_MAX_OPTION_CHARS);
      if (boundedOptionId === null || boundedDescription === null) {
        return fail('jev_invalid_criterion', `question "${id}" has an empty or oversized criterion`);
      }
      criteria[boundedOptionId] = boundedDescription;
    }
    return { ok: true, question: { id, type: 'choice', instructions, criteria } };
  }

  if (raw.type === 'score') {
    if (!Array.isArray(raw.criteria)) {
      return fail('jev_invalid_score_criteria', `question "${id}" requires a criteria list`);
    }
    if (raw.criteria.length === 0) {
      return fail('jev_empty_score_criteria', `question "${id}" requires at least one rubric level`);
    }
    if (raw.criteria.length > JEV_MAX_SCORE_LEVELS) {
      return fail('jev_too_many_score_levels', `question "${id}" allows at most ${JEV_MAX_SCORE_LEVELS} rubric levels`);
    }
    const scoreCriteria: string[] = [];
    for (const level of raw.criteria) {
      const bounded = readBoundedString(level, JEV_MAX_OPTION_CHARS);
      if (bounded === null) {
        return fail('jev_invalid_score_level', `question "${id}" has an empty or oversized rubric level`);
      }
      scoreCriteria.push(bounded);
    }
    return { ok: true, question: { id, type: 'score', instructions, criteria: scoreCriteria } };
  }

  return fail(
    'jev_unknown_question_type',
    `question "${id}" has an unsupported type; expected choice, noul or score`,
  );
}

/**
 * Normalize a provider payload into per-question typed answers.
 *
 * A question with no usable answer is omitted rather than filled with a
 * default, so the caller can tell a real answer from a missing one. Returns
 * `null` when the payload carries no answers at all.
 */
export function parseJevDecisionAnswers(
  raw: unknown,
  questions: readonly JevDecisionQuestionSpec[],
): Record<string, JevDecisionAnswer> | null {
  const container = isRecord(raw) && isRecord(raw.answers) ? raw.answers : null;
  if (!container) return null;

  const answers: Record<string, JevDecisionAnswer> = {};

  for (const question of questions) {
    const entry = container[question.id];
    if (!isRecord(entry)) continue;
    const answer = parseAnswer(question, entry);
    if (answer) answers[question.id] = answer;
  }

  return Object.keys(answers).length > 0 ? answers : null;
}

function parseAnswer(
  question: JevDecisionQuestionSpec,
  entry: Record<string, unknown>,
): JevDecisionAnswer | null {
  if (question.type === 'noul') {
    const noul = readProbability(entry.noul);
    return noul === null ? null : { type: 'noul', noul };
  }

  if (question.type === 'choice') {
    const choice = readBoundedString(entry.choice, JEV_MAX_QUESTION_ID_CHARS);
    if (choice === null || !(choice in question.criteria)) return null;
    const probabilities = readDistribution(entry.probabilities);
    const confidence = readProbability(entry.confidence) ?? probabilities?.[choice] ?? 0;
    return { type: 'choice', choice, confidence, probabilities: probabilities ?? { [choice]: confidence } };
  }

  const index = readIndex(entry.score, question.criteria.length);
  if (index === null) return null;
  const level = question.criteria[index];
  if (level === undefined) return null;
  const probabilities = readIndexedDistribution(entry.probabilities, question.criteria.length);
  const confidence = readProbability(entry.confidence) ?? probabilities?.[String(index)] ?? 0;
  return {
    type: 'score',
    score: index,
    confidence,
    level,
    legend: readLegend(entry.legend),
    probabilities,
  };
}

/** A rubric position is a non-negative integer inside the criteria list. */
function readIndex(raw: unknown, length: number): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 0 || raw >= length) return null;
  return raw;
}

function readLegend(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined;
  const legend: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') legend[key] = value;
  }
  return Object.keys(legend).length > 0 ? legend : undefined;
}

function readIndexedDistribution(
  raw: unknown,
  length: number,
): Record<string, number> | undefined {
  if (!isRecord(raw)) return undefined;
  const distribution: Record<string, number> = {};
  for (let index = 0; index < length; index += 1) {
    const probability = readProbability(raw[String(index)]);
    if (probability !== null) distribution[String(index)] = probability;
  }
  return Object.keys(distribution).length > 0 ? distribution : undefined;
}

function readDistribution(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const distribution: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const probability = readProbability(value);
    if (probability !== null) distribution[key] = probability;
  }
  return Object.keys(distribution).length > 0 ? distribution : null;
}

function readProbability(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 1) return null;
  return raw;
}

function readBoundedString(raw: unknown, maxChars: number): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxChars) return null;
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}
