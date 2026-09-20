import type {
  ProjectKnowledgeRecordKind,
  ProjectKnowledgeStatus,
} from './project-knowledge-runtime-contracts';
import type { ProjectKnowledgeRuntimeCommandContracts } from './project-knowledge-runtime-contracts';
import { isPlainRuntimeRecord } from './runtime-boundary';

type CommandType = keyof ProjectKnowledgeRuntimeCommandContracts;
type PayloadCommandType = {
  [TType in CommandType]:
    'payload' extends keyof ProjectKnowledgeRuntimeCommandContracts[TType]['request'] ? TType : never;
}[CommandType];
export type ProjectKnowledgeRuntimePayload<TType extends PayloadCommandType> =
  ProjectKnowledgeRuntimeCommandContracts[TType]['request'] extends { payload: infer TPayload }
    ? TPayload
    : never;

type DecoderMap = {
  [TType in PayloadCommandType]: (value: unknown) => ProjectKnowledgeRuntimePayload<TType>;
};

export const PROJECT_KNOWLEDGE_RUNTIME_PAYLOAD_DECODERS: DecoderMap = {
  PROJECT_KNOWLEDGE_QUERY(value) {
    const payload = record(value, 'PROJECT_KNOWLEDGE_QUERY.payload');
    nonEmpty(payload.projectId, 'PROJECT_KNOWLEDGE_QUERY.payload.projectId');
    optionalString(payload.query, 'PROJECT_KNOWLEDGE_QUERY.payload.query');
    optionalString(payload.conversationId, 'PROJECT_KNOWLEDGE_QUERY.payload.conversationId');
    return payload as ProjectKnowledgeRuntimePayload<'PROJECT_KNOWLEDGE_QUERY'>;
  },
  PROJECT_KNOWLEDGE_GET(value) {
    const payload = record(value, 'PROJECT_KNOWLEDGE_GET.payload');
    nonEmpty(payload.projectId, 'PROJECT_KNOWLEDGE_GET.payload.projectId');
    nonEmpty(payload.recordId, 'PROJECT_KNOWLEDGE_GET.payload.recordId');
    return payload as ProjectKnowledgeRuntimePayload<'PROJECT_KNOWLEDGE_GET'>;
  },
  PROJECT_KNOWLEDGE_MUTATE(value) {
    const payload = record(value, 'PROJECT_KNOWLEDGE_MUTATE.payload');
    nonEmpty(payload.projectId, 'PROJECT_KNOWLEDGE_MUTATE.payload.projectId');
    enumValue(payload.action, ['propose', 'resolve', 'sharing', 'import'], 'PROJECT_KNOWLEDGE_MUTATE.payload.action');
    optionalString(payload.recordId, 'PROJECT_KNOWLEDGE_MUTATE.payload.recordId');
    enumValueOptional(payload.status, ['candidate', 'confirmed', 'disputed', 'superseded', 'retracted'], 'PROJECT_KNOWLEDGE_MUTATE.payload.status');
    enumValueOptional(payload.sharing, ['project', 'excluded'], 'PROJECT_KNOWLEDGE_MUTATE.payload.sharing');
    if (payload.excludedConversationIds !== undefined) {
      stringArray(payload.excludedConversationIds, 'PROJECT_KNOWLEDGE_MUTATE.payload.excludedConversationIds');
    }
    if (payload.action === 'propose') {
      const proposal = record(payload.record, 'PROJECT_KNOWLEDGE_MUTATE.payload.record');
      nonEmpty(proposal.content, 'PROJECT_KNOWLEDGE_MUTATE.payload.record.content');
      enumValue(proposal.kind, ['session_summary', 'decision', 'verified_result', 'failure', 'handoff', 'conflict'], 'PROJECT_KNOWLEDGE_MUTATE.payload.record.kind');
    }
    return payload as ProjectKnowledgeRuntimePayload<'PROJECT_KNOWLEDGE_MUTATE'>;
  },
  PROJECT_KNOWLEDGE_EXPORT(value) {
    const payload = record(value, 'PROJECT_KNOWLEDGE_EXPORT.payload');
    nonEmpty(payload.projectId, 'PROJECT_KNOWLEDGE_EXPORT.payload.projectId');
    return payload as ProjectKnowledgeRuntimePayload<'PROJECT_KNOWLEDGE_EXPORT'>;
  },
  PROJECT_RUNS_LIST(value) {
    const payload = record(value, 'PROJECT_RUNS_LIST.payload');
    nonEmpty(payload.projectId, 'PROJECT_RUNS_LIST.payload.projectId');
    optionalString(payload.conversationId, 'PROJECT_RUNS_LIST.payload.conversationId');
    return payload as ProjectKnowledgeRuntimePayload<'PROJECT_RUNS_LIST'>;
  },
  PROJECT_KNOWLEDGE_CAPTURE(value) {
    const payload = record(value, 'PROJECT_KNOWLEDGE_CAPTURE.payload');
    for (const key of ['projectId', 'conversationId', 'messageId', 'text', 'contentHash']) {
      nonEmpty(payload[key], `PROJECT_KNOWLEDGE_CAPTURE.payload.${key}`);
    }
    enumValue(payload.role, ['user', 'assistant'], 'PROJECT_KNOWLEDGE_CAPTURE.payload.role');
    optionalString(payload.branchId, 'PROJECT_KNOWLEDGE_CAPTURE.payload.branchId');
    if (payload.sourceRefs !== undefined) stringArray(payload.sourceRefs, 'PROJECT_KNOWLEDGE_CAPTURE.payload.sourceRefs');
    return payload as ProjectKnowledgeRuntimePayload<'PROJECT_KNOWLEDGE_CAPTURE'>;
  },
};

export function decodeProjectKnowledgeRuntimePayload<TType extends PayloadCommandType>(
  type: TType,
  value: unknown,
): ProjectKnowledgeRuntimePayload<TType> {
  return PROJECT_KNOWLEDGE_RUNTIME_PAYLOAD_DECODERS[type](value);
}

function record(value: unknown, path: string): Record<string, any> {
  if (!isPlainRuntimeRecord(value)) throw new Error(`${path} must be a plain object`);
  return value;
}
function nonEmpty(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}
function optionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'string') throw new Error(`${path} must be a string`);
}
function stringArray(value: unknown, path: string): void {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error(`${path} must be a string array`);
}
function enumValue<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`${path} has an invalid value`);
  return value as T;
}
function enumValueOptional<T extends string>(value: unknown, values: readonly T[], path: string): void {
  if (value !== undefined) enumValue(value, values, path);
}

export type { ProjectKnowledgeRecordKind, ProjectKnowledgeStatus };
