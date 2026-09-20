import { estimateTokens } from '../token/estimator';
import type { ProjectContextRecord } from './types';

export const PROJECT_CONTEXT_RETRIEVAL_BUDGET = 2_000;

export function normalizeProjectContextText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/\r\n?/g, '\n').trim();
}

export function segmentProjectContextText(text: string): string[] {
  const normalized = normalizeProjectContextText(text);
  const tokens = new Set<string>();
  for (const identifier of text.match(/[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)*/g) ?? []) {
    for (const part of identifier.split(/[_-]+|(?<=[a-z0-9])(?=[A-Z])/u)) {
      if (part) tokens.add(part.toLocaleLowerCase());
    }
  }
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('ko', { granularity: 'word' })
    : null;
  if (segmenter) {
    for (const item of segmenter.segment(normalized)) {
      if (item.isWordLike && item.segment.trim()) tokens.add(item.segment);
    }
  }
  for (const word of normalized.match(/[\p{L}\p{N}]+/gu) ?? []) tokens.add(word);
  // Keep both the original identifier and stable fragments. This lets a
  // query written as `build-pipeline`, `build_pipeline`, or `buildPipeline`
  // find the same stored identifier without weakening ordinary word search.
  for (const identifier of normalized.match(/[\p{L}\p{N}_-]+/gu) ?? []) {
    const compactIdentifier = identifier.replace(/[_-]+/g, '');
    if (compactIdentifier !== identifier) tokens.add(compactIdentifier);
    for (const part of identifier.split(/[_-]+/u)) if (part) tokens.add(part);
    for (const camelPart of identifier.split(/(?<=[a-z0-9])(?=[A-Z])/u)) {
      if (camelPart) tokens.add(camelPart.toLocaleLowerCase());
    }
  }
  const compact = normalized.replace(/[^\p{L}\p{N}]/gu, '');
  for (let index = 0; index < compact.length; index += 1) {
    const char = compact[index];
    if (/^[\u3400-\u9fff\uac00-\ud7af]$/u.test(char)) tokens.add(char);
    const pair = compact.slice(index, index + 2);
    if (pair.length === 2 && /[\u3400-\u9fff\uac00-\ud7af]/u.test(pair)) tokens.add(pair);
  }
  return [...tokens].filter((token) => token.length > 0);
}

export function formatProjectContextRecord(record: ProjectContextRecord): string {
  return `- [${record.status}] ${record.content}`;
}

export function scoreProjectContextRecord(queryTokens: readonly string[], record: ProjectContextRecord): number {
  if (queryTokens.length === 0) return 0;
  const searchable = new Set(segmentProjectContextText([
    record.content,
    record.conversationId,
    record.branchId,
    record.source.messageId,
    record.sourceHash,
    record.dedupKey,
    ...(record.sourceRefs ?? []),
    ...(record.evidenceRefs ?? []),
  ].join(' ')));
  let hits = 0;
  for (const token of queryTokens) {
    if (searchable.has(token)) hits += 1;
    else if ([...searchable].some((candidate) => candidate.includes(token) || token.includes(candidate))) hits += 0.5;
  }
  return hits / queryTokens.length;
}

export function fitProjectContextRecords(
  records: readonly ProjectContextRecord[],
  budgetTokens = PROJECT_CONTEXT_RETRIEVAL_BUDGET,
  limit = 20,
): { records: ProjectContextRecord[]; usedTokens: number; truncated: boolean } {
  const budget = Math.max(0, Math.floor(budgetTokens));
  const selected: ProjectContextRecord[] = [];
  let usedTokens = 0;
  let truncated = false;
  for (const record of records) {
    if (selected.length >= Math.max(0, limit)) {
      truncated = true;
      break;
    }
    const cost = estimateTokens(formatProjectContextRecord(record));
    if (cost > budget - usedTokens) {
      truncated = true;
      continue;
    }
    selected.push(record);
    usedTokens += cost;
  }
  return { records: selected, usedTokens, truncated };
}
