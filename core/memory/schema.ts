export const MEMORY_DATABASE_NAME = 'DeepSeekPP';
export const MEMORY_DATABASE_VERSION = 4 as const;
export const MEMORY_TABLE_NAME = 'memories';
export const PROJECT_CONTEXT_RECORDS_TABLE_NAME = 'project_context_records';
export const PROJECT_CONTEXT_RUNS_TABLE_NAME = 'project_context_runs';
export const PROJECT_CONTEXT_SHARING_TABLE_NAME = 'project_context_sharing';

export const PROJECT_CONTEXT_RECORDS_TABLE_SCHEMA =
  '&id, projectId, conversationId, status, sourceHash, contentHash, dedupKey, updatedAt';
export const PROJECT_CONTEXT_RUNS_TABLE_SCHEMA =
  '&id, projectId, conversationId, status, idempotencyKey, updatedAt, leaseId';
export const PROJECT_CONTEXT_SHARING_TABLE_SCHEMA =
  '&projectId, revision, updatedAt';

export const MEMORY_TABLE_SCHEMAS = {
  1: '++id, type, name, pinned, createdAt, updatedAt, lastAccessedAt',
  2: '++id, type, name, pinned, createdAt, updatedAt, lastAccessedAt, syncId',
  3: '++id, type, name, pinned, createdAt, updatedAt, lastAccessedAt, syncId, scope, projectId',
  4: '++id, type, name, pinned, createdAt, updatedAt, lastAccessedAt, syncId, scope, projectId',
} as const;

export type PersistedMemoryRecord = Record<string, unknown>;

export function migrateMemoryV1RecordToV2(
  memory: PersistedMemoryRecord,
  syncId: string,
): PersistedMemoryRecord {
  return { ...memory, syncId };
}

export function migrateMemoryV2RecordToV3(memory: PersistedMemoryRecord): PersistedMemoryRecord {
  const { projectId: _projectId, ...rest } = memory;
  return { ...rest, scope: 'global' };
}
