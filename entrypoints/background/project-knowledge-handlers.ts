import type { RuntimeMessageContext } from '../../core/messaging/runtime-boundary';
import {
  defineProjectKnowledgePayloadRuntimeCommandHandler,
  type ProjectKnowledgeRuntimePayload,
} from './runtime-handler';
import type { RuntimeCommandHandler } from '../../core/messaging/runtime-command-registry';
import {
  captureProjectKnowledge,
  exportProjectContext,
  getProjectContextRecord,
  getProjectContextSharing,
  importProjectContext,
  listProjectContextRuns,
  listProjectContext,
  proposeProjectContext,
  resolveProjectContext,
  searchProjectContext,
  setProjectContextSharing,
} from '../../core/project-context';
import type {
  ProjectContextRecord,
  ProjectContextRecordStatus,
  ProjectContextRunRecord,
} from '../../core/project-context';
import type {
  ProjectKnowledgeExportBundle,
  ProjectKnowledgeQueryResult,
  ProjectKnowledgeRecordSummary,
  ProjectKnowledgeRunSummary,
  ProjectKnowledgeSharingState,
} from '../../core/messaging/project-knowledge-runtime-contracts';

export interface ProjectKnowledgeRuntimeHandlerDependencies {
  getProjectContextState(): Promise<{ projects: readonly { id: string }[] }>;
  getProjectForConversation(conversationId: string): Promise<{ id: string } | null>;
}

export function createProjectKnowledgeHandlers(
  dependencies: ProjectKnowledgeRuntimeHandlerDependencies,
): readonly RuntimeCommandHandler[] {
  return Object.freeze([
    defineProjectKnowledgePayloadRuntimeCommandHandler('PROJECT_KNOWLEDGE_QUERY', async (payload, context) => {
      const scope = await resolveScope(payload, context, dependencies);
      const result = await searchProjectContext({
        projectId: scope.projectId,
        ...(scope.conversationId === undefined ? {} : { conversationId: scope.conversationId }),
        query: payload.query ?? '',
        limit: 20,
        budgetTokens: 2_000,
      });
      const runs = await listProjectContextRuns({ projectId: result.projectId, conversationId: scope.conversationId, limit: 20 });
      return {
        records: result.records.map(toRecordSummary),
        runs: runs.map(toRunSummary),
        sharing: await buildSharing(result.projectId),
      } satisfies ProjectKnowledgeQueryResult;
    }),
    defineProjectKnowledgePayloadRuntimeCommandHandler('PROJECT_KNOWLEDGE_GET', async (payload, context) => {
      const scope = await resolveScope(payload, context, dependencies);
      const record = await getProjectContextRecord(payload.recordId, scope);
      return record ? toRecordSummary(record) : null;
    }),
    defineProjectKnowledgePayloadRuntimeCommandHandler('PROJECT_KNOWLEDGE_EXPORT', async (payload, context) => {
      const scope = await resolveScope(payload, context, dependencies);
      const bundle = await exportProjectContext({ projectId: scope.projectId, includeExcluded: true });
      return bundle satisfies ProjectKnowledgeExportBundle;
    }),
    defineProjectKnowledgePayloadRuntimeCommandHandler('PROJECT_RUNS_LIST', async (payload, context) => {
      const scope = await resolveScope(payload, context, dependencies);
      const runs = await listProjectContextRuns({ projectId: scope.projectId, conversationId: scope.conversationId, limit: 100 });
      return runs.map(toRunSummary);
    }),
    defineProjectKnowledgePayloadRuntimeCommandHandler('PROJECT_KNOWLEDGE_CAPTURE', async (payload, context) => {
      if (context.surface !== 'deepseek_content') throw new Error('Project knowledge capture requires a DeepSeek content sender.');
      if (context.chatSessionId !== payload.conversationId) throw new Error('Project knowledge capture conversation mismatch.');
      const project = await dependencies.getProjectForConversation(payload.conversationId);
      if (!project || project.id !== payload.projectId) throw new Error('Project knowledge capture project mismatch.');
      const result = await captureProjectKnowledge(payload);
      return { ok: true as const, duplicate: result.duplicate };
    }),
    defineProjectKnowledgePayloadRuntimeCommandHandler('PROJECT_KNOWLEDGE_MUTATE', async (payload, context) => {
      if (context.surface !== 'extension_context') throw new Error('Project knowledge mutation requires an extension UI sender.');
      const scope = await resolveScope(payload, context, dependencies);
      if (payload.action === 'propose') {
        const record = payload.record;
        if (!record) throw new Error('Project knowledge proposal is missing a record.');
        const conversationId = record.conversationId ?? scope.conversationId;
        if (!conversationId) throw new Error('Project knowledge proposal requires a project conversation.');
        const branchId = record.branchId ?? conversationId;
        await proposeProjectContext({
          projectId: scope.projectId,
          conversationId,
          messageId: record.messageId ?? crypto.randomUUID(),
          branchId,
          role: record.role ?? 'assistant',
          content: record.content,
          kind: record.kind,
          sourceRefs: record.sourceRefs ? [...record.sourceRefs] : undefined,
          evidenceRefs: record.evidenceRefs ? [...record.evidenceRefs] : undefined,
        });
      } else if (payload.action === 'resolve') {
        if (!payload.recordId || !payload.status) throw new Error('Project knowledge resolution requires recordId and status.');
        await resolveProjectContext(payload.recordId, {
          status: payload.status,
          expectedRevision: payload.record?.revision,
          reason: payload.record?.content,
        }, scope);
      } else if (payload.action === 'sharing') {
        if (payload.recordId) {
          if (!payload.sharing) throw new Error('Project knowledge sharing requires sharing.');
          await setProjectContextSharing(payload.recordId, payload.sharing, scope, payload.record?.revision);
        } else {
          await setProjectContextSharing(scope.projectId, payload.excludedConversationIds ?? []);
        }
      } else if (payload.action === 'import') {
        if (!payload.bundle) throw new Error('Project knowledge import is missing a bundle.');
        await importProjectContext({ projectId: scope.projectId, snapshot: payload.bundle as never });
      }
      return { ok: true as const };
    }),
  ]);
}

async function resolveScope(
  payload: { projectId: string; conversationId?: string },
  context: RuntimeMessageContext,
  dependencies: ProjectKnowledgeRuntimeHandlerDependencies,
): Promise<{ projectId: string; conversationId?: string }> {
  if (context.surface === 'deepseek_content') {
    const conversationId = context.chatSessionId;
    if (!conversationId) throw new Error('DeepSeek sender has no current conversation.');
    if (payload.conversationId !== undefined && payload.conversationId !== conversationId) throw new Error('Project knowledge conversation mismatch.');
    const project = await dependencies.getProjectForConversation(conversationId);
    if (!project || project.id !== payload.projectId) throw new Error('Project knowledge project mismatch.');
    return { projectId: project.id, conversationId };
  }
  const state = await dependencies.getProjectContextState();
  if (!state.projects.some((project) => project.id === payload.projectId)) throw new Error('Project knowledge project was not found.');
  if (payload.conversationId !== undefined) {
    const project = await dependencies.getProjectForConversation(payload.conversationId);
    if (!project || project.id !== payload.projectId) throw new Error('Project knowledge conversation is not in this project.');
  }
  return { projectId: payload.projectId, ...(payload.conversationId === undefined ? {} : { conversationId: payload.conversationId }) };
}

async function buildSharing(projectId: string): Promise<ProjectKnowledgeSharingState> {
  const sharing = await getProjectContextSharing(projectId);
  return { projectId, excludedConversationIds: sharing.excludedConversationIds, revision: sharing.revision };
}

function toRecordSummary(record: ProjectContextRecord): ProjectKnowledgeRecordSummary {
  return {
    id: record.id,
    projectId: record.projectId,
    conversationId: record.conversationId,
    kind: record.kind ?? 'session_summary',
    content: record.content,
    status: record.status,
    sourceRefs: record.sourceRefs?.length
      ? [...record.sourceRefs]
      : [`conversation:${record.source.conversationId}`, `message:${record.source.messageId}`],
    evidenceRefs: record.evidenceRefs?.length ? [...record.evidenceRefs] : [record.sourceHash],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    revision: record.revision,
    ...(record.supersedesRecordId === undefined ? {} : { supersedesId: record.supersedesRecordId }),
  };
}

function toRunSummary(run: ProjectContextRunRecord): ProjectKnowledgeRunSummary {
  return {
    runId: run.id,
    projectId: run.projectId,
    conversationId: run.conversationId ?? '',
    state: run.status,
    startedAt: run.startedAt ?? run.createdAt,
    updatedAt: run.updatedAt,
    toolName: run.kind,
    errorCode: run.error,
  };
}
