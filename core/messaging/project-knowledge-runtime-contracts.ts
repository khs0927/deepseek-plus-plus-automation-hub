import type { MessageAction } from '../types';
import type { ProjectContextExport } from '../project-context/types';

type DeclaredRuntimeRequest<TType extends MessageAction['type']> = Extract<
  MessageAction,
  { type: TType }
>;

export type ProjectKnowledgeStatus =
  | 'candidate'
  | 'confirmed'
  | 'disputed'
  | 'superseded'
  | 'retracted';

export type ProjectKnowledgeRecordKind =
  | 'session_summary'
  | 'decision'
  | 'verified_result'
  | 'failure'
  | 'handoff'
  | 'conflict';

export interface ProjectKnowledgeRecordSummary {
  id: string;
  projectId: string;
  conversationId: string;
  kind: ProjectKnowledgeRecordKind;
  content: string;
  status: ProjectKnowledgeStatus;
  sourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  createdAt: number;
  updatedAt: number;
  revision: number;
  supersedesId?: string;
}

export interface ProjectKnowledgeRunSummary {
  runId: string;
  projectId: string;
  conversationId: string;
  state: string;
  startedAt: number;
  updatedAt: number;
  toolName?: string;
  errorCode?: string;
}

export interface ProjectKnowledgeSharingState {
  projectId: string;
  excludedConversationIds: readonly string[];
  revision: number;
}

export interface ProjectKnowledgeQueryResult {
  records: readonly ProjectKnowledgeRecordSummary[];
  runs: readonly ProjectKnowledgeRunSummary[];
  sharing: ProjectKnowledgeSharingState;
}

/** Export/import uses the canonical durable record shape, not the prompt summary shape. */
export type ProjectKnowledgeExportBundle = ProjectContextExport;

export interface ProjectKnowledgeRuntimeCommandContracts {
  PROJECT_KNOWLEDGE_QUERY: {
    request: DeclaredRuntimeRequest<'PROJECT_KNOWLEDGE_QUERY'>;
    response: ProjectKnowledgeQueryResult;
  };
  PROJECT_KNOWLEDGE_GET: {
    request: DeclaredRuntimeRequest<'PROJECT_KNOWLEDGE_GET'>;
    response: ProjectKnowledgeRecordSummary | null;
  };
  PROJECT_KNOWLEDGE_MUTATE: {
    request: DeclaredRuntimeRequest<'PROJECT_KNOWLEDGE_MUTATE'>;
    response: { ok: true };
  };
  PROJECT_KNOWLEDGE_EXPORT: {
    request: DeclaredRuntimeRequest<'PROJECT_KNOWLEDGE_EXPORT'>;
    response: ProjectKnowledgeExportBundle;
  };
  PROJECT_RUNS_LIST: {
    request: DeclaredRuntimeRequest<'PROJECT_RUNS_LIST'>;
    response: readonly ProjectKnowledgeRunSummary[];
  };
  PROJECT_KNOWLEDGE_CAPTURE: {
    request: DeclaredRuntimeRequest<'PROJECT_KNOWLEDGE_CAPTURE'>;
    response: { ok: true; duplicate: boolean };
  };
}
