export const PROJECT_CONTEXT_RECORD_SCHEMA_VERSION = 1 as const;
export const PROJECT_CONTEXT_EXPORT_SCHEMA_VERSION = 'deepseek-pp.project-context-export.v1' as const;

export type ProjectContextRecordStatus =
  | 'candidate'
  | 'confirmed'
  | 'disputed'
  | 'superseded'
  | 'retracted';

export type ProjectContextSharing = 'project' | 'excluded';
export type ProjectContextMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ProjectContextSource {
  conversationId: string;
  messageId: string;
  branchId: string;
  role: ProjectContextMessageRole;
  sourceHash: string;
}

export interface ProjectContextRecord {
  schemaVersion: typeof PROJECT_CONTEXT_RECORD_SCHEMA_VERSION;
  id: string;
  projectId: string;
  conversationId: string;
  branchId: string;
  content: string;
  contentHash: string;
  source: ProjectContextSource;
  sourceHash: string;
  dedupKey: string;
  status: ProjectContextRecordStatus;
  sharing: ProjectContextSharing;
  sharingRevision: number;
  revision: number;
  supersedesRecordId?: string;
  supersededByRecordId?: string;
  conflictSetId?: string;
  statusReason?: string;
  createdAt: number;
  capturedAt: number;
  updatedAt: number;
  resolvedAt?: number;
  /** Optional P3 projection fields. They are additive for v1 rows. */
  kind: ProjectContextRecordKind;
  sourceRefs?: string[];
  evidenceRefs?: string[];
  provenance?: ProjectContextProvenance;
}

export type ProjectContextRecordKind =
  | 'session_summary'
  | 'decision'
  | 'verified_result'
  | 'failure'
  | 'handoff'
  | 'conflict';

export interface ProjectContextProvenance {
  source: 'conversation';
  conversationId: string;
  messageId: string;
  branchId: string;
  role: ProjectContextMessageRole;
  capturedAt: number;
}

export interface ProjectContextScope {
  projectId?: string;
  conversationId?: string;
}

export interface CaptureCompletedMessageResult {
  record: ProjectContextRecord;
  deduplicated: boolean;
}

export interface ProjectContextProposalInput {
  projectId: string;
  conversationId: string;
  messageId: string;
  branchId: string;
  role: ProjectContextMessageRole;
  content: string;
  contentHash?: string;
  kind?: ProjectContextRecordKind;
  sourceRefs?: string[];
  evidenceRefs?: string[];
  conflictSetId?: string;
  statusReason?: string;
}

export interface ProjectContextSearchOptions extends ProjectContextScope {
  query: string;
  limit?: number;
  budgetTokens?: number;
  includeExcluded?: boolean;
  statuses?: readonly ProjectContextRecordStatus[];
}

export interface ProjectContextSearchResult {
  projectId: string;
  records: ProjectContextRecord[];
  usedTokens: number;
  budgetTokens: number;
  truncated: boolean;
}

export interface ListProjectContextOptions extends ProjectContextScope {
  limit?: number;
  includeExcluded?: boolean;
  statuses?: readonly ProjectContextRecordStatus[];
}

export interface ProjectContextResolution {
  status: ProjectContextRecordStatus;
  expectedRevision?: number;
  replacementRecordId?: string;
  reason?: string;
}

export interface ProjectContextExport {
  schemaVersion: typeof PROJECT_CONTEXT_EXPORT_SCHEMA_VERSION;
  projectId: string;
  exportedAt: number;
  records: ProjectContextRecord[];
  sharing?: ProjectContextSharingState;
}

export interface ProjectContextSharingState {
  projectId: string;
  excludedConversationIds: string[];
  revision: number;
  updatedAt?: number;
}

export interface ExportProjectContextOptions {
  projectId: string;
  includeExcluded?: boolean;
  statuses?: readonly ProjectContextRecordStatus[];
}

export interface ImportProjectContextInput {
  projectId: string;
  snapshot: ProjectContextExport;
}

export interface ImportProjectContextResult {
  imported: ProjectContextRecord[];
  deduplicated: number;
}

export interface ProjectKnowledgeQueryResult {
  records: ProjectContextRecord[];
  runs: ProjectContextRunRecord[];
  sharing: ProjectContextSharingState;
}

export interface ProjectKnowledgeRecordSummary {
  id: string;
  projectId: string;
  conversationId: string;
  kind: ProjectContextRecordKind;
  content: string;
  status: ProjectContextRecordStatus;
  sourceRefs: string[];
  evidenceRefs: string[];
  createdAt: number;
  updatedAt: number;
  revision: number;
  supersedesId?: string;
}

export type ProjectContextRunKind =
  | 'capture'
  | 'search'
  | 'proposal'
  | 'resolution'
  | 'export'
  | 'import'
  | 'execution';

export type ProjectContextRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const PROJECT_CONTEXT_RUN_SCHEMA_VERSION = 1 as const;

export interface ProjectContextRunRecord {
  schemaVersion: typeof PROJECT_CONTEXT_RUN_SCHEMA_VERSION;
  id: string;
  projectId: string;
  conversationId?: string;
  kind: ProjectContextRunKind;
  status: ProjectContextRunStatus;
  attempt: number;
  idempotencyKey: string;
  leaseId?: string;
  deadlineAt?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  resultSummary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectContextRunInput {
  projectId: string;
  conversationId?: string;
  kind: ProjectContextRunKind;
  idempotencyKey: string;
  deadlineAt?: number;
}

export interface ListProjectContextRunsOptions extends ProjectContextScope {
  status?: ProjectContextRunStatus;
  limit?: number;
}
