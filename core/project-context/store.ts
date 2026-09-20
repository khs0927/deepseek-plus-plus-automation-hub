import { getProjectForConversation } from '../project/store';
import { withSyncLocalStateLock } from '../persistence/local-state-lock';
import { assertCurrentMemoryDatabaseVersion, db } from '../memory/database';
import {
  PROJECT_CONTEXT_RECORDS_TABLE_NAME,
  PROJECT_CONTEXT_RUNS_TABLE_NAME,
  PROJECT_CONTEXT_SHARING_TABLE_NAME,
} from '../memory/schema';
import {
  decodeProjectContextExport,
  decodeProjectContextRecord,
  decodeProjectContextRun,
  decodeProjectContextSharingState,
} from './codec';
import {
  fitProjectContextRecords,
  normalizeProjectContextText,
  PROJECT_CONTEXT_RETRIEVAL_BUDGET,
  scoreProjectContextRecord,
  segmentProjectContextText,
} from './search';
import type {
  CaptureCompletedMessageResult,
  CreateProjectContextRunInput,
  ExportProjectContextOptions,
  ImportProjectContextInput,
  ImportProjectContextResult,
  ListProjectContextOptions,
  ListProjectContextRunsOptions,
  ProjectContextExport,
  ProjectContextProposalInput,
  ProjectContextRecord,
  ProjectContextRecordStatus,
  ProjectContextResolution,
  ProjectContextRunRecord,
  ProjectContextScope,
  ProjectContextSearchOptions,
  ProjectContextSearchResult,
  ProjectContextSharing,
  ProjectContextMessageRole,
  ProjectContextSharingState,
  ProjectKnowledgeQueryResult,
} from './types';
import { PROJECT_CONTEXT_EXPORT_SCHEMA_VERSION, PROJECT_CONTEXT_RECORD_SCHEMA_VERSION, PROJECT_CONTEXT_RUN_SCHEMA_VERSION } from './types';

const recordsTable = db.table(PROJECT_CONTEXT_RECORDS_TABLE_NAME);
const runsTable = db.table(PROJECT_CONTEXT_RUNS_TABLE_NAME);
const sharingTable = db.table(PROJECT_CONTEXT_SHARING_TABLE_NAME);
const ACTIVE_STATUSES: readonly ProjectContextRecordStatus[] = ['candidate', 'confirmed', 'disputed'];
const ALL_STATUSES: readonly ProjectContextRecordStatus[] = [
  'candidate', 'confirmed', 'disputed', 'superseded', 'retracted',
];

export async function captureCompletedMessage(
  conversationId: string,
  messageId: string,
  branchId: string,
  role: ProjectContextMessageRole,
  text: string,
): Promise<CaptureCompletedMessageResult | null> {
  const project = await getProjectForConversation(required(conversationId, 'conversationId'));
  const content = normalizeProjectContextText(text);
  if (!project || !content) return null;
  return proposeInProject({
    projectId: project.id,
    conversationId,
    messageId,
    branchId,
    role,
    content,
  });
}

export async function proposeProjectContext(input: ProjectContextProposalInput): Promise<CaptureCompletedMessageResult> {
  return proposeInProject({ ...input, content: normalizeProjectContextText(input.content) });
}

export async function listProjectContext(options: ListProjectContextOptions): Promise<ProjectContextRecord[]> {
  const projectId = await resolveProjectId(options);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const records = await readRecordsAlreadyLocked();
    const sharing = await readProjectContextSharingAlreadyLocked(projectId);
    return filterRecords(records, projectId, options.includeExcluded, options.statuses, sharing)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, boundedLimit(options.limit, Number.MAX_SAFE_INTEGER));
  });
}

export async function searchProjectContext(options: ProjectContextSearchOptions): Promise<ProjectContextSearchResult> {
  const projectId = await resolveProjectId(options);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const queryTokens = segmentProjectContextText(options.query);
    const candidates = filterRecords(
      await readRecordsAlreadyLocked(),
      projectId,
      options.includeExcluded,
      options.statuses,
      await readProjectContextSharingAlreadyLocked(projectId),
    );
    const ranked = candidates
      .map((record) => ({ record, score: scoreProjectContextRecord(queryTokens, record) }))
      .sort((left, right) => right.score - left.score || right.record.updatedAt - left.record.updatedAt)
      .map(({ record }) => record);
    const fitted = fitProjectContextRecords(
      ranked,
      Math.min(options.budgetTokens ?? PROJECT_CONTEXT_RETRIEVAL_BUDGET, PROJECT_CONTEXT_RETRIEVAL_BUDGET),
      boundedLimit(options.limit, 100),
    );
    return { projectId, ...fitted, budgetTokens: Math.min(options.budgetTokens ?? PROJECT_CONTEXT_RETRIEVAL_BUDGET, PROJECT_CONTEXT_RETRIEVAL_BUDGET) };
  });
}

export async function getProjectContextRecord(
  recordId: string,
  scope: ProjectContextScope,
): Promise<ProjectContextRecord | null> {
  const projectId = await resolveProjectId(scope);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const record = (await readRecordsAlreadyLocked()).find((item) => item.id === required(recordId, 'recordId')) ?? null;
    return record?.projectId === projectId ? record : null;
  });
}

export async function resolveProjectContext(
  recordId: string,
  resolution: ProjectContextResolution,
  scope: ProjectContextScope,
): Promise<ProjectContextRecord> {
  const projectId = await resolveProjectId(scope);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const current = (await readRecordsAlreadyLocked()).find((item) => item.id === required(recordId, 'recordId'));
    if (!current || current.projectId !== projectId) throw new Error('Project context record not found');
    if (resolution.expectedRevision !== undefined && resolution.expectedRevision !== current.revision) {
      throw new Error(`Project context record revision conflict: expected ${resolution.expectedRevision}, got ${current.revision}`);
    }
    const now = Date.now();
    const next: ProjectContextRecord = {
      ...current,
      status: resolution.status,
      revision: current.revision + 1,
      updatedAt: now,
      ...(resolution.reason === undefined ? {} : { statusReason: resolution.reason }),
      ...(resolution.replacementRecordId === undefined ? {} : { supersededByRecordId: resolution.replacementRecordId }),
      ...(resolution.status === 'candidate' ? {} : { resolvedAt: now }),
    };
    const validated = decodeProjectContextRecord(next);
    await recordsTable.put(validated);
    return validated;
  });
}

async function setRecordSharing(
  recordId: string,
  sharing: ProjectContextSharing,
  scope: ProjectContextScope,
  expectedRevision?: number,
): Promise<ProjectContextRecord> {
  const projectId = await resolveProjectId(scope);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const current = (await readRecordsAlreadyLocked()).find((item) => item.id === required(recordId, 'recordId'));
    if (!current || current.projectId !== projectId) throw new Error('Project context record not found');
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new Error('Project context sharing revision conflict');
    const next: ProjectContextRecord = {
      ...current,
      sharing,
      sharingRevision: current.sharingRevision + 1,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    };
    const validated = decodeProjectContextRecord(next);
    await recordsTable.put(validated);
    return validated;
  });
}

export const setProjectContextSharing = setSharing;

/**
 * Public sharing API. The project-level overload is the runtime/UI contract;
 * the record-level overload is retained for callers that need to mark one
 * legacy row excluded without changing the project conversation fence.
 */
export function setSharing(
  projectId: string,
  excludedConversationIds: readonly string[],
  expectedRevision?: number,
): Promise<ProjectContextSharingState>;
export function setSharing(
  recordId: string,
  sharing: ProjectContextSharing,
  scope: ProjectContextScope,
  expectedRevision?: number,
): Promise<ProjectContextRecord>;
export function setSharing(
  first: string,
  second: readonly string[] | ProjectContextSharing,
  third?: number | ProjectContextScope,
  fourth?: number,
): Promise<ProjectContextSharingState | ProjectContextRecord> {
  if (Array.isArray(second)) {
    return setProjectContextConversationSharing(first, second, typeof third === 'number' ? third : undefined);
  }
  const recordSharing = second as ProjectContextSharing;
  return setRecordSharing(first, recordSharing, (third && typeof third === 'object') ? third : {}, fourth);
}

/** Read the project-wide conversation sharing fence used by search/export. */
export async function getProjectContextSharing(projectId: string): Promise<ProjectContextSharingState> {
  const normalizedProjectId = required(projectId, 'projectId');
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    return readProjectContextSharingAlreadyLocked(normalizedProjectId);
  });
}

/**
 * Background-owned project sharing mutation. The local record `sharing` flag
 * remains supported for older rows; this state is the authoritative
 * conversation-level exclusion list for new queries and exports.
 */
export async function setProjectContextConversationSharing(
  projectId: string,
  excludedConversationIds: readonly string[],
  expectedRevision?: number,
): Promise<ProjectContextSharingState> {
  const normalizedProjectId = required(projectId, 'projectId');
  const excluded = [...new Set(excludedConversationIds.map((id) => required(id, 'conversationId')))].sort();
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const current = await readProjectContextSharingAlreadyLocked(normalizedProjectId);
    if (expectedRevision !== undefined && expectedRevision !== current.revision) {
      throw new Error(`Project context sharing revision conflict: expected ${expectedRevision}, got ${current.revision}`);
    }
    const next: ProjectContextSharingState = {
      ...current,
      excludedConversationIds: excluded,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    };
    const validated = decodeProjectContextSharingState(next);
    await sharingTable.put(validated);
    return validated;
  });
}

export const setProjectKnowledgeSharing = setProjectContextConversationSharing;

/** Remove all project knowledge rows when the owning project is deleted. */
export async function deleteProjectContextDataAlreadyLocked(projectId: string): Promise<void> {
  const normalizedProjectId = required(projectId, 'projectId');
  await assertCurrentMemoryDatabaseVersion();
  await db.transaction('rw', [recordsTable, runsTable, sharingTable], async (tx) => {
    await tx.table(PROJECT_CONTEXT_RECORDS_TABLE_NAME).where('projectId').equals(normalizedProjectId).delete();
    await tx.table(PROJECT_CONTEXT_RUNS_TABLE_NAME).where('projectId').equals(normalizedProjectId).delete();
    await tx.table(PROJECT_CONTEXT_SHARING_TABLE_NAME).delete(normalizedProjectId);
  });
}

export async function exportProjectContext(options: ExportProjectContextOptions): Promise<ProjectContextExport> {
  const records = await listProjectContext({
    projectId: options.projectId,
    includeExcluded: options.includeExcluded,
    // An export is a durable snapshot, so it must retain resolved history by
    // default. Search/list keep their smaller active-set default.
    statuses: options.statuses ?? ALL_STATUSES,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const sharing = await getProjectContextSharing(options.projectId);
  return {
    schemaVersion: PROJECT_CONTEXT_EXPORT_SCHEMA_VERSION,
    projectId: required(options.projectId, 'projectId'),
    exportedAt: Date.now(),
    records,
    sharing,
  };
}

/** Contract-shaped aggregate used by Background query handlers. */
export async function queryProjectContext(
  options: Omit<ProjectContextSearchOptions, 'query'> & { query?: string },
): Promise<ProjectKnowledgeQueryResult> {
  const projectId = await resolveProjectId(options);
  const [search, runs, sharing] = await Promise.all([
    searchProjectContext({ ...options, query: options.query ?? '' }),
    listProjectContextRuns({ projectId, conversationId: options.conversationId }),
    getProjectContextSharing(projectId),
  ]);
  return { records: search.records, runs, sharing };
}

export const queryProjectKnowledge = queryProjectContext;

export const getProjectKnowledgeRecord = (
  projectId: string,
  recordId: string,
): Promise<ProjectContextRecord | null> => getProjectContextRecord(recordId, { projectId });

export const listProjectKnowledgeRuns = listProjectContextRuns;
export const createProjectKnowledgeRun = createProjectContextRun;
export const exportProjectKnowledge = exportProjectContext;
export const importProjectKnowledge = importProjectContext;

/** Adapter for the Background capture command's message-shaped payload. */
export async function captureProjectKnowledge(input: {
  projectId: string;
  conversationId: string;
  branchId?: string | null;
  messageId: string;
  role: 'user' | 'assistant';
  text: string;
  sourceRefs?: string[];
  contentHash: string;
}): Promise<{ ok: true; duplicate: boolean; record: ProjectContextRecord }> {
  const result = await proposeProjectContext({
    projectId: input.projectId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    branchId: input.branchId?.trim() || 'main',
    role: input.role,
    content: input.text,
    sourceRefs: input.sourceRefs,
    contentHash: input.contentHash,
  });
  return { ok: true, duplicate: result.deduplicated, record: result.record };
}

export async function importProjectContext(input: ImportProjectContextInput): Promise<ImportProjectContextResult> {
  const projectId = required(input.projectId, 'projectId');
  const snapshot = decodeProjectContextExport(input.snapshot);
  if (snapshot.projectId !== projectId) throw new Error('Project context import cannot cross project boundaries');
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const existing = await readRecordsAlreadyLocked();
    const existingKeys = new Set(existing.filter((record) => record.projectId === projectId).map((record) => record.dedupKey));
    const imported: ProjectContextRecord[] = [];
    let deduplicated = 0;
    const recordsToPut: ProjectContextRecord[] = [];
    for (const source of snapshot.records) {
      if (source.projectId !== projectId) throw new Error('Project context snapshot contains a foreign project record');
      if (existingKeys.has(source.dedupKey)) {
        deduplicated += 1;
        continue;
      }
      const now = Date.now();
      const idCollision = existing.some((record) => record.id === source.id);
      const record = {
        ...source,
        id: idCollision ? crypto.randomUUID() : source.id,
        projectId,
        ...(idCollision ? { updatedAt: now } : {}),
      };
      recordsToPut.push(record);
      existingKeys.add(record.dedupKey);
      existing.push(record);
      imported.push(record);
    }
    const sharing = snapshot.sharing
      ? decodeProjectContextSharingState(snapshot.sharing)
      : undefined;
    if (sharing && sharing.projectId !== projectId) throw new Error('Project context snapshot sharing crosses project boundaries');
    await db.transaction('rw', [recordsTable, sharingTable], async (tx) => {
      const records = tx.table(PROJECT_CONTEXT_RECORDS_TABLE_NAME);
      const sharingTableInTx = tx.table(PROJECT_CONTEXT_SHARING_TABLE_NAME);
      for (const record of recordsToPut) await records.put(record);
      if (sharing) await sharingTableInTx.put({ ...sharing, updatedAt: sharing.updatedAt ?? Date.now() });
    });
    return { imported, deduplicated };
  });
}

export async function createProjectContextRun(input: CreateProjectContextRunInput): Promise<ProjectContextRunRecord> {
  const projectId = required(input.projectId, 'projectId');
  const idempotencyKey = required(input.idempotencyKey, 'idempotencyKey');
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const current = await readRunsAlreadyLocked();
    const existing = current.find((run) => run.projectId === projectId && run.idempotencyKey === idempotencyKey);
    if (existing) return existing;
    const now = Date.now();
    const run: ProjectContextRunRecord = {
      schemaVersion: PROJECT_CONTEXT_RUN_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      projectId,
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
      kind: input.kind,
      status: 'queued',
      attempt: 0,
      idempotencyKey,
      ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
      createdAt: now,
      updatedAt: now,
    };
    await runsTable.put(run);
    return run;
  });
}

export async function getProjectContextRun(runId: string, scope: ProjectContextScope): Promise<ProjectContextRunRecord | null> {
  const projectId = await resolveProjectId(scope);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const run = (await readRunsAlreadyLocked()).find((item) => item.id === required(runId, 'runId')) ?? null;
    return run?.projectId === projectId ? run : null;
  });
}

export async function listProjectContextRuns(options: ListProjectContextRunsOptions): Promise<ProjectContextRunRecord[]> {
  const projectId = await resolveProjectId(options);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    return (await readRunsAlreadyLocked())
      .filter((run) => run.projectId === projectId
        && (options.conversationId === undefined || run.conversationId === options.conversationId)
        && (options.status === undefined || run.status === options.status))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, boundedLimit(options.limit, 100));
  });
}

export async function claimProjectContextRun(runId: string, leaseId: string, scope: ProjectContextScope): Promise<ProjectContextRunRecord> {
  const projectId = await resolveProjectId(scope);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const run = (await readRunsAlreadyLocked()).find((item) => item.id === required(runId, 'runId'));
    if (!run || run.projectId !== projectId) throw new Error('Project context run not found');
    if (run.status !== 'queued') throw new Error(`Project context run is not queued: ${run.status}`);
    const next = { ...run, status: 'running' as const, leaseId: required(leaseId, 'leaseId'), attempt: run.attempt + 1, startedAt: Date.now(), updatedAt: Date.now() };
    await runsTable.put(next);
    return next;
  });
}

export async function completeProjectContextRun(runId: string, leaseId: string, scope: ProjectContextScope, resultSummary?: string): Promise<ProjectContextRunRecord> {
  return finishRun(runId, leaseId, scope, 'completed', undefined, resultSummary);
}

export async function failProjectContextRun(runId: string, leaseId: string, scope: ProjectContextScope, error: string): Promise<ProjectContextRunRecord> {
  return finishRun(runId, leaseId, scope, 'failed', required(error, 'error'));
}

async function finishRun(runId: string, leaseId: string, scope: ProjectContextScope, status: 'completed' | 'failed', error?: string, resultSummary?: string): Promise<ProjectContextRunRecord> {
  const projectId = await resolveProjectId(scope);
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const run = (await readRunsAlreadyLocked()).find((item) => item.id === required(runId, 'runId'));
    if (!run || run.projectId !== projectId) throw new Error('Project context run not found');
    if (run.status !== 'running' || run.leaseId !== required(leaseId, 'leaseId')) throw new Error('Project context run lease conflict');
    const next = { ...run, status, updatedAt: Date.now(), finishedAt: Date.now(), ...(error === undefined ? {} : { error }), ...(resultSummary === undefined ? {} : { resultSummary }), leaseId: undefined };
    await runsTable.put(next);
    return next;
  });
}

async function proposeInProject(input: ProjectContextProposalInput): Promise<CaptureCompletedMessageResult> {
  const projectId = required(input.projectId, 'projectId');
  const conversationId = required(input.conversationId, 'conversationId');
  const project = await getProjectForConversation(conversationId);
  if (!project || project.id !== projectId) {
    throw new Error('Project context proposal conversation is not assigned to the project.');
  }
  const messageId = required(input.messageId, 'messageId');
  const branchId = required(input.branchId, 'branchId');
  const role = input.role;
  const content = required(input.content, 'content');
  const [contentHash, sourceHash] = await Promise.all([
    input.contentHash?.trim() ? input.contentHash.trim() : hashText(content),
    hashText(`${projectId}\n${conversationId}\n${messageId}\n${branchId}\n${role}`),
  ]);
  const dedupKey = `${sourceHash}:${contentHash}`;
  return withSyncLocalStateLock(async () => {
    await assertCurrentMemoryDatabaseVersion();
    const current = await readRecordsAlreadyLocked();
    const duplicate = current.find((record) => record.projectId === projectId && record.dedupKey === dedupKey);
    if (duplicate) return { record: duplicate, deduplicated: true };
    const now = Date.now();
    const record: ProjectContextRecord = {
      schemaVersion: PROJECT_CONTEXT_RECORD_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      projectId,
      conversationId,
      branchId,
      content,
    contentHash,
      source: { conversationId, messageId, branchId, role, sourceHash },
      sourceHash,
      dedupKey,
    status: 'candidate',
    sharing: 'project',
    sharingRevision: 0,
    revision: 1,
    kind: input.kind ?? 'session_summary',
    sourceRefs: input.sourceRefs?.length ? [...input.sourceRefs] : [messageId],
    evidenceRefs: input.evidenceRefs ? [...input.evidenceRefs] : [],
    provenance: {
      source: 'conversation',
      conversationId,
      messageId,
      branchId,
      role,
      capturedAt: now,
    },
      ...(input.conflictSetId === undefined ? {} : { conflictSetId: input.conflictSetId }),
      ...(input.statusReason === undefined ? {} : { statusReason: input.statusReason }),
      createdAt: now,
      capturedAt: now,
      updatedAt: now,
    };
    const superseded = current.filter((item) => item.projectId === projectId && item.sourceHash === sourceHash && ACTIVE_STATUSES.includes(item.status));
    for (const old of superseded) {
      await recordsTable.put({ ...old, status: 'superseded', supersededByRecordId: record.id, revision: old.revision + 1, updatedAt: now });
    }
    const validated = decodeProjectContextRecord(record);
    await recordsTable.put(validated);
    return { record: validated, deduplicated: false };
  });
}

async function resolveProjectId(scope: ProjectContextScope): Promise<string> {
  const explicit = scope.projectId?.trim();
  const conversationId = scope.conversationId?.trim();
  if (conversationId) {
    const project = await getProjectForConversation(conversationId);
    if (!project) throw new Error(`Conversation is not assigned to a project: ${conversationId}`);
    if (explicit && explicit !== project.id) throw new Error('Project context scope crosses project boundaries');
    return project.id;
  }
  if (explicit) return explicit;
  throw new Error('A projectId or conversationId scope is required');
}

function filterRecords(
  records: readonly ProjectContextRecord[],
  projectId: string,
  includeExcluded = false,
  statuses?: readonly ProjectContextRecordStatus[],
  sharing?: ProjectContextSharingState,
): ProjectContextRecord[] {
  const allowed = statuses ? new Set(statuses) : new Set(ACTIVE_STATUSES);
  const excludedConversationIds = new Set(sharing?.excludedConversationIds ?? []);
  return records.filter((record) => record.projectId === projectId
    && (includeExcluded
      || (record.sharing !== 'excluded' && !excludedConversationIds.has(record.conversationId)))
    && allowed.has(record.status));
}

async function readRecordsAlreadyLocked(): Promise<ProjectContextRecord[]> {
  const rows = await recordsTable.toArray();
  return rows.map((row, index) => decodeProjectContextRecord(row, `projectContextRecords[${index}]`));
}

async function readRunsAlreadyLocked(): Promise<ProjectContextRunRecord[]> {
  const rows = await runsTable.toArray();
  return rows.map((row, index) => decodeProjectContextRun(row, `projectContextRuns[${index}]`));
}

async function readProjectContextSharingAlreadyLocked(projectId: string): Promise<ProjectContextSharingState> {
  const row = await sharingTable.get(projectId) as unknown;
  if (row === undefined) {
    return { projectId, excludedConversationIds: [], revision: 0 };
  }
  return decodeProjectContextSharingState(row);
}

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function required(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required`);
  return value.trim();
}
function boundedLimit(value: number | undefined, max: number): number {
  return Math.min(max, Math.max(1, Math.floor(value ?? 20)));
}
