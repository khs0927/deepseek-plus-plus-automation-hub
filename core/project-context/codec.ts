import {
  PROJECT_CONTEXT_EXPORT_SCHEMA_VERSION,
  PROJECT_CONTEXT_RECORD_SCHEMA_VERSION,
  PROJECT_CONTEXT_RUN_SCHEMA_VERSION,
  type ProjectContextExport,
  type ProjectContextRecord,
  type ProjectContextRecordStatus,
  type ProjectContextRunKind,
  type ProjectContextRunRecord,
  type ProjectContextRunStatus,
  type ProjectContextSource,
  type ProjectContextSharing,
  type ProjectContextMessageRole,
  type ProjectContextRecordKind,
  type ProjectContextSharingState,
} from './types';

const STATUSES: readonly ProjectContextRecordStatus[] = [
  'candidate', 'confirmed', 'disputed', 'superseded', 'retracted',
];
const RUN_KINDS: readonly ProjectContextRunKind[] = [
  'capture', 'search', 'proposal', 'resolution', 'export', 'import', 'execution',
];
const RUN_STATUSES: readonly ProjectContextRunStatus[] = [
  'queued', 'running', 'completed', 'failed', 'cancelled',
];
const ROLES: readonly ProjectContextMessageRole[] = ['user', 'assistant', 'system', 'tool'];
const SHARING: readonly ProjectContextSharing[] = ['project', 'excluded'];
const RECORD_KINDS: readonly ProjectContextRecordKind[] = [
  'session_summary', 'decision', 'verified_result', 'failure', 'handoff', 'conflict',
];

export function decodeProjectContextRecord(value: unknown, path = 'projectContextRecord'): ProjectContextRecord {
  const object = recordValue(value, path);
  const source = decodeSource(object.source, `${path}.source`);
  const record = {
    ...object,
    schemaVersion: exactVersion(object.schemaVersion, PROJECT_CONTEXT_RECORD_SCHEMA_VERSION, `${path}.schemaVersion`),
    id: requiredString(object.id, `${path}.id`),
    projectId: requiredString(object.projectId, `${path}.projectId`),
    conversationId: requiredString(object.conversationId, `${path}.conversationId`),
    branchId: requiredString(object.branchId, `${path}.branchId`),
    content: requiredString(object.content, `${path}.content`),
    contentHash: requiredString(object.contentHash, `${path}.contentHash`),
    source,
    sourceHash: requiredString(object.sourceHash, `${path}.sourceHash`),
    dedupKey: requiredString(object.dedupKey, `${path}.dedupKey`),
    status: enumValue(object.status, STATUSES, `${path}.status`),
    sharing: enumValue(object.sharing, SHARING, `${path}.sharing`),
    sharingRevision: nonNegativeInteger(object.sharingRevision, `${path}.sharingRevision`),
    revision: positiveInteger(object.revision, `${path}.revision`),
    createdAt: finiteNumber(object.createdAt, `${path}.createdAt`),
    capturedAt: finiteNumber(object.capturedAt, `${path}.capturedAt`),
    updatedAt: finiteNumber(object.updatedAt, `${path}.updatedAt`),
    ...(object.supersedesRecordId === undefined ? {} : { supersedesRecordId: requiredString(object.supersedesRecordId, `${path}.supersedesRecordId`) }),
    ...(object.supersededByRecordId === undefined ? {} : { supersededByRecordId: requiredString(object.supersededByRecordId, `${path}.supersededByRecordId`) }),
    ...(object.conflictSetId === undefined ? {} : { conflictSetId: requiredString(object.conflictSetId, `${path}.conflictSetId`) }),
    ...(object.statusReason === undefined ? {} : { statusReason: stringValue(object.statusReason, `${path}.statusReason`) }),
    ...(object.resolvedAt === undefined ? {} : { resolvedAt: finiteNumber(object.resolvedAt, `${path}.resolvedAt`) }),
    kind: object.kind === undefined ? 'session_summary' : enumValue(object.kind, RECORD_KINDS, `${path}.kind`),
    sourceRefs: object.sourceRefs === undefined
      ? [source.messageId]
      : stringArray(object.sourceRefs, `${path}.sourceRefs`),
    evidenceRefs: object.evidenceRefs === undefined
      ? []
      : stringArray(object.evidenceRefs, `${path}.evidenceRefs`),
    provenance: object.provenance === undefined
      ? {
          source: 'conversation' as const,
          conversationId: source.conversationId,
          messageId: source.messageId,
          branchId: source.branchId,
          role: source.role,
          capturedAt: finiteNumber(object.capturedAt, `${path}.capturedAt`),
        }
      : decodeProvenance(object.provenance, `${path}.provenance`),
  } as ProjectContextRecord;
  if (record.sourceHash !== record.source.sourceHash) throw new Error(`${path}.sourceHash does not match source.sourceHash`);
  return record;
}

export function decodeProjectContextRun(value: unknown, path = 'projectContextRun'): ProjectContextRunRecord {
  const object = recordValue(value, path);
  return {
    ...object,
    schemaVersion: exactVersion(object.schemaVersion, PROJECT_CONTEXT_RUN_SCHEMA_VERSION, `${path}.schemaVersion`),
    id: requiredString(object.id, `${path}.id`),
    projectId: requiredString(object.projectId, `${path}.projectId`),
    ...(object.conversationId === undefined ? {} : { conversationId: requiredString(object.conversationId, `${path}.conversationId`) }),
    kind: enumValue(object.kind, RUN_KINDS, `${path}.kind`),
    status: enumValue(object.status, RUN_STATUSES, `${path}.status`),
    attempt: nonNegativeInteger(object.attempt, `${path}.attempt`),
    idempotencyKey: requiredString(object.idempotencyKey, `${path}.idempotencyKey`),
    ...(object.leaseId === undefined ? {} : { leaseId: requiredString(object.leaseId, `${path}.leaseId`) }),
    ...(object.deadlineAt === undefined ? {} : { deadlineAt: finiteNumber(object.deadlineAt, `${path}.deadlineAt`) }),
    ...(object.startedAt === undefined ? {} : { startedAt: finiteNumber(object.startedAt, `${path}.startedAt`) }),
    ...(object.finishedAt === undefined ? {} : { finishedAt: finiteNumber(object.finishedAt, `${path}.finishedAt`) }),
    ...(object.error === undefined ? {} : { error: stringValue(object.error, `${path}.error`) }),
    ...(object.resultSummary === undefined ? {} : { resultSummary: stringValue(object.resultSummary, `${path}.resultSummary`) }),
    createdAt: finiteNumber(object.createdAt, `${path}.createdAt`),
    updatedAt: finiteNumber(object.updatedAt, `${path}.updatedAt`),
  } as ProjectContextRunRecord;
}

export function decodeProjectContextExport(value: unknown, path = 'projectContextExport'): ProjectContextExport {
  const object = recordValue(value, path);
  const records = arrayValue(object.records, `${path}.records`)
    .map((record, index) => decodeProjectContextRecord(record, `${path}.records[${index}]`));
  return {
    ...object,
    schemaVersion: exactVersion(object.schemaVersion, PROJECT_CONTEXT_EXPORT_SCHEMA_VERSION, `${path}.schemaVersion`),
    projectId: requiredString(object.projectId, `${path}.projectId`),
    exportedAt: finiteNumber(object.exportedAt, `${path}.exportedAt`),
    records,
    ...(object.sharing === undefined ? {} : { sharing: decodeSharingState(object.sharing, `${path}.sharing`) }),
  };
}

export function decodeProjectContextSharingState(
  value: unknown,
  path = 'projectContextSharing',
): ProjectContextSharingState {
  return decodeSharingState(value, path);
}

function decodeSource(value: unknown, path: string): ProjectContextSource {
  const object = recordValue(value, path);
  return {
    ...object,
    conversationId: requiredString(object.conversationId, `${path}.conversationId`),
    messageId: requiredString(object.messageId, `${path}.messageId`),
    branchId: requiredString(object.branchId, `${path}.branchId`),
    role: enumValue(object.role, ROLES, `${path}.role`),
    sourceHash: requiredString(object.sourceHash, `${path}.sourceHash`),
  } as ProjectContextSource;
}

function decodeProvenance(value: unknown, path: string) {
  const object = recordValue(value, path);
  if (object.source !== 'conversation') throw new Error(`${path}.source is invalid`);
  return {
    ...object,
    source: 'conversation' as const,
    conversationId: requiredString(object.conversationId, `${path}.conversationId`),
    messageId: requiredString(object.messageId, `${path}.messageId`),
    branchId: requiredString(object.branchId, `${path}.branchId`),
    role: enumValue(object.role, ROLES, `${path}.role`),
    capturedAt: finiteNumber(object.capturedAt, `${path}.capturedAt`),
  };
}

function decodeSharingState(value: unknown, path: string): ProjectContextSharingState {
  const object = recordValue(value, path);
  return {
    ...object,
    projectId: requiredString(object.projectId, `${path}.projectId`),
    excludedConversationIds: stringArray(object.excludedConversationIds, `${path}.excludedConversationIds`),
    revision: nonNegativeInteger(object.revision, `${path}.revision`),
    ...(object.updatedAt === undefined ? {} : { updatedAt: finiteNumber(object.updatedAt, `${path}.updatedAt`) }),
  };
}

function recordValue(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}
function stringArray(value: unknown, path: string): string[] {
  return arrayValue(value, path).map((item, index) => requiredString(item, `${path}[${index}]`));
}
function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${path} must be a non-empty string`);
  return value;
}
function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  return value;
}
function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
  return value;
}
function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${path} must be a positive integer`);
  return value as number;
}
function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${path} must be a non-negative integer`);
  return value as number;
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${path} is invalid`);
  return value as T;
}
function exactVersion<T extends number | string>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new Error(`${path} is not supported`);
  return expected;
}
