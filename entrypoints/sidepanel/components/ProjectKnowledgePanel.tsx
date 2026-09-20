import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectConversation } from '../../../core/types';
import { decodeProjectContextExport } from '../../../core/project-context/codec';
import type {
  ProjectKnowledgeExportBundle,
  ProjectKnowledgeQueryResult,
  ProjectKnowledgeRecordKind,
  ProjectKnowledgeRecordSummary,
  ProjectKnowledgeRunSummary,
  ProjectKnowledgeSharingState,
  ProjectKnowledgeStatus,
} from '../../../core/messaging/project-knowledge-runtime-contracts';
import { useI18n } from '../i18n';
import {
  SidepanelRuntimeError,
  sidepanelRuntimeClient,
} from '../runtime-client';
import { getRuntimeErrorMessage } from '../runtime-response';
import { Spinner, StatusBadge, useBanner } from './settings/primitives';

const KNOWLEDGE_STATUSES: readonly ProjectKnowledgeStatus[] = [
  'candidate',
  'confirmed',
  'disputed',
  'superseded',
  'retracted',
];

const KNOWLEDGE_KINDS: readonly ProjectKnowledgeRecordKind[] = [
  'session_summary',
  'decision',
  'verified_result',
  'failure',
  'handoff',
  'conflict',
];

export interface ProjectKnowledgePanelProps {
  projectId: string;
  conversations: readonly ProjectConversation[];
}

export default function ProjectKnowledgePanel({
  projectId,
  conversations,
}: ProjectKnowledgePanelProps) {
  const { t } = useI18n();
  const [records, setRecords] = useState<readonly ProjectKnowledgeRecordSummary[]>([]);
  const [runs, setRuns] = useState<readonly ProjectKnowledgeRunSummary[]>([]);
  const [sharing, setSharing] = useState<ProjectKnowledgeSharingState | null>(null);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [excludedConversationIds, setExcludedConversationIds] = useState<Set<string>>(new Set());
  const [resolutionStatuses, setResolutionStatuses] = useState<Record<string, ProjectKnowledgeStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const generation = useRef(0);
  const banner = useBanner();

  const kindLabels = useMemo<Record<ProjectKnowledgeRecordKind, string>>(() => ({
    session_summary: t('sidepanel.projectsPage.knowledgeKinds.sessionSummary'),
    decision: t('sidepanel.projectsPage.knowledgeKinds.decision'),
    verified_result: t('sidepanel.projectsPage.knowledgeKinds.verifiedResult'),
    failure: t('sidepanel.projectsPage.knowledgeKinds.failure'),
    handoff: t('sidepanel.projectsPage.knowledgeKinds.handoff'),
    conflict: t('sidepanel.projectsPage.knowledgeKinds.conflict'),
  }), [t]);

  const statusLabels = useMemo<Record<ProjectKnowledgeStatus, string>>(() => ({
    candidate: t('sidepanel.projectsPage.knowledgeStatuses.candidate'),
    confirmed: t('sidepanel.projectsPage.knowledgeStatuses.confirmed'),
    disputed: t('sidepanel.projectsPage.knowledgeStatuses.disputed'),
    superseded: t('sidepanel.projectsPage.knowledgeStatuses.superseded'),
    retracted: t('sidepanel.projectsPage.knowledgeStatuses.retracted'),
  }), [t]);

  useEffect(() => {
    setQuery('');
    setAppliedQuery('');
    void loadKnowledge('');
    return () => {
      generation.current += 1;
    };
  }, [projectId]);

  async function loadKnowledge(nextQuery = appliedQuery) {
    const requestGeneration = ++generation.current;
    setLoading(true);
    setLoadError(false);
    try {
      const result = await sidepanelRuntimeClient.request(
        {
          type: 'PROJECT_KNOWLEDGE_QUERY',
          payload: {
            projectId,
            ...(nextQuery.trim() ? { query: nextQuery.trim() } : {}),
          },
        },
        {
          unavailableMessage: t('sidepanel.projectsPage.backendUnavailable'),
          decode: decodeProjectKnowledgeQueryResult,
        },
      );

      let nextRuns = result.runs;
      try {
        nextRuns = await sidepanelRuntimeClient.request(
          { type: 'PROJECT_RUNS_LIST', payload: { projectId } },
          {
            unavailableMessage: t('sidepanel.projectsPage.backendUnavailable'),
            decode: decodeProjectKnowledgeRuns,
          },
        );
      } catch {
        // Older runtimes may include runs in the query response but not expose
        // the dedicated list yet. Keep the query result usable in that case.
      }

      if (requestGeneration !== generation.current) return;
      setRecords(result.records);
      setRuns(nextRuns);
      setSharing(result.sharing);
      setExcludedConversationIds(new Set(result.sharing.excludedConversationIds));
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      setLoadError(true);
      showError(error);
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }

  async function resolveRecord(record: ProjectKnowledgeRecordSummary) {
    const status = resolutionStatuses[record.id] ?? record.status;
    if (status === record.status) return;
    await runAction(`resolve:${record.id}`, async () => {
      await sidepanelRuntimeClient.request({
        type: 'PROJECT_KNOWLEDGE_MUTATE',
        payload: {
          projectId,
          action: 'resolve',
          recordId: record.id,
          status,
        },
      }, { unavailableMessage: t('sidepanel.projectsPage.backendUnavailable') });
      await loadKnowledge();
    });
  }

  async function saveSharing() {
    await runAction('sharing', async () => {
      await sidepanelRuntimeClient.request({
        type: 'PROJECT_KNOWLEDGE_MUTATE',
        payload: {
          projectId,
          action: 'sharing',
          excludedConversationIds: [...excludedConversationIds],
        },
      }, { unavailableMessage: t('sidepanel.projectsPage.backendUnavailable') });
      await loadKnowledge();
      banner.show('success', t('sidepanel.projectsPage.knowledgeSharingSaved'));
    });
  }

  async function exportKnowledge() {
    await runAction('export', async () => {
      const bundle = await sidepanelRuntimeClient.request(
        { type: 'PROJECT_KNOWLEDGE_EXPORT', payload: { projectId } },
        {
          unavailableMessage: t('sidepanel.projectsPage.backendUnavailable'),
          decode: decodeProjectKnowledgeExportBundle,
        },
      );
      downloadJson(bundle, `project-${projectId}-knowledge.json`);
      banner.show('success', t('sidepanel.projectsPage.knowledgeExported'));
    });
  }

  async function importKnowledge(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    await runAction('import', async () => {
      const bundle = decodeProjectKnowledgeExportBundle(JSON.parse(await file.text()));
      if (bundle.projectId !== projectId) {
        throw new Error(t('sidepanel.projectsPage.knowledgeImportMismatch'));
      }
      await sidepanelRuntimeClient.request({
        type: 'PROJECT_KNOWLEDGE_MUTATE',
        payload: { projectId, action: 'import', bundle },
      }, { unavailableMessage: t('sidepanel.projectsPage.backendUnavailable') });
      await loadKnowledge();
      banner.show('success', t('sidepanel.projectsPage.knowledgeImported'));
    });
  }

  async function runAction(action: string, operation: () => Promise<void>) {
    setBusyAction(action);
    banner.clear();
    try {
      await operation();
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }

  function showError(error: unknown) {
    if (error instanceof SidepanelRuntimeError && error.kind === 'transport' && error.retryable) {
      banner.show('error', t('sidepanel.projectsPage.backendStarting'));
      return;
    }
    banner.show('error', t('sidepanel.projectsPage.knowledgeOperationFailed', {
      error: getRuntimeErrorMessage(error),
    }));
  }

  const excludedCount = excludedConversationIds.size;

  return (
    <section className="ds-surface-panel rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold" style={{ color: 'var(--ds-text)' }}>
            {t('sidepanel.projectsPage.knowledgeTitle')}
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--ds-text-tertiary)' }}>
            {t('sidepanel.projectsPage.knowledgeDescription')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadKnowledge()}
          disabled={loading || busyAction !== null}
          className="ds-btn-secondary px-2 py-1 text-[11px] rounded-md disabled:opacity-40"
        >
          {t('sidepanel.projectsPage.knowledgeRefresh')}
        </button>
      </div>

      {banner.node}

      <div className="flex flex-wrap gap-2">
        <form
          className="flex flex-1 min-w-[180px] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedQuery(query.trim());
            void loadKnowledge(query.trim());
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('sidepanel.projectsPage.knowledgeSearchPlaceholder')}
            aria-label={t('sidepanel.projectsPage.knowledgeSearchPlaceholder')}
            className="min-w-0 flex-1 px-3 py-2 text-xs rounded-lg border outline-none"
            style={inputStyle}
          />
          <button type="submit" className="ds-btn-secondary px-3 py-2 text-[11px] rounded-md">
            {t('sidepanel.projectsPage.knowledgeSearch')}
          </button>
        </form>
        <label className="ds-btn-secondary px-3 py-2 text-[11px] rounded-md cursor-pointer">
          {t('sidepanel.projectsPage.knowledgeImport')}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label={t('sidepanel.projectsPage.knowledgeImport')}
            onChange={(event) => void importKnowledge(event)}
          />
        </label>
        <button
          type="button"
          onClick={() => void exportKnowledge()}
          disabled={busyAction !== null}
          className="ds-btn-secondary px-3 py-2 text-[11px] rounded-md disabled:opacity-40"
        >
          {busyAction === 'export' && <Spinner className="w-3 h-3 mr-1 align-[-2px]" />}
          {t('sidepanel.projectsPage.knowledgeExport')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>
          <Spinner /> {t('common.loading')}
        </div>
      ) : loadError ? (
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)', background: 'var(--ds-bg)' }}>
          {t('sidepanel.projectsPage.knowledgeLoadFailed')}
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--ds-text)' }}>
                {t('sidepanel.projectsPage.knowledgeRecordsTitle')}
              </div>
              <span className="text-[10px]" style={{ color: 'var(--ds-text-tertiary)' }}>
                {t('sidepanel.projectsPage.knowledgeRecordsCount', { count: records.length })}
              </span>
            </div>
            {records.length === 0 ? (
              <div className="rounded-lg px-3 py-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)', background: 'var(--ds-bg)' }}>
                {t('sidepanel.projectsPage.knowledgeEmpty')}
              </div>
            ) : (
              <div className="space-y-2">
                {records.map((record) => (
                  <KnowledgeRecordCard
                    key={record.id}
                    record={record}
                    kindLabel={kindLabels[record.kind]}
                    statusLabels={statusLabels}
                    resolutionStatus={resolutionStatuses[record.id] ?? record.status}
                    busy={busyAction === `resolve:${record.id}`}
                    onStatusChange={(status) => setResolutionStatuses((current) => ({ ...current, [record.id]: status }))}
                    onResolve={() => void resolveRecord(record)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold" style={{ color: 'var(--ds-text)' }}>
              {t('sidepanel.projectsPage.knowledgeSharingTitle')}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>
              {t('sidepanel.projectsPage.knowledgeSharingDescription')}
            </div>
            <div className="space-y-1.5">
              {conversations.length === 0 ? (
                <div className="rounded-lg px-3 py-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)', background: 'var(--ds-bg)' }}>
                  {t('sidepanel.projectsPage.emptyConversations')}
                </div>
              ) : conversations.map((conversation) => {
                const excluded = excludedConversationIds.has(conversation.conversationId);
                return (
                  <label key={conversation.conversationId} className="flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer" style={{ borderColor: 'var(--ds-border)', background: 'var(--ds-bg)' }}>
                    <input
                      type="checkbox"
                      checked={excluded}
                      onChange={() => setExcludedConversationIds((current) => {
                        const next = new Set(current);
                        if (next.has(conversation.conversationId)) next.delete(conversation.conversationId);
                        else next.add(conversation.conversationId);
                        return next;
                      })}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] truncate" style={{ color: 'var(--ds-text)' }}>{conversation.title}</span>
                      <span className="block text-[10px] font-mono truncate" style={{ color: 'var(--ds-text-tertiary)' }}>{conversation.conversationId}</span>
                    </span>
                    {excluded && (
                      <StatusBadge configured configuredLabel={t('sidepanel.projectsPage.knowledgeExcluded')} notConfiguredLabel={t('sidepanel.projectsPage.knowledgeExcluded')} />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px]" style={{ color: 'var(--ds-text-tertiary)' }}>
                {t('sidepanel.projectsPage.knowledgeExcludedCount', { count: excludedCount })}
                {sharing ? ` · ${t('sidepanel.projectsPage.knowledgeSharingRevision', { revision: sharing.revision })}` : ''}
              </span>
              <button
                type="button"
                onClick={() => void saveSharing()}
                disabled={busyAction !== null}
                className="ds-btn-primary px-3 py-1.5 text-[11px] rounded-md disabled:opacity-40"
              >
                {busyAction === 'sharing' && <Spinner className="w-3 h-3 mr-1 align-[-2px]" />}
                {t('sidepanel.projectsPage.knowledgeSaveSharing')}
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--ds-text)' }}>
                {t('sidepanel.projectsPage.knowledgeRunsTitle')}
              </div>
              <span className="text-[10px]" style={{ color: 'var(--ds-text-tertiary)' }}>
                {t('sidepanel.projectsPage.knowledgeRunsCount', { count: runs.length })}
              </span>
            </div>
            {runs.length === 0 ? (
              <div className="rounded-lg px-3 py-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)', background: 'var(--ds-bg)' }}>
                {t('sidepanel.projectsPage.knowledgeRunsEmpty')}
              </div>
            ) : (
              <div className="space-y-1.5">
                {runs.map((run) => (
                  <div key={run.runId} className="rounded-lg border px-2.5 py-2 space-y-1" style={{ borderColor: 'var(--ds-border)', background: 'var(--ds-bg)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono truncate" style={{ color: 'var(--ds-text)' }}>{run.runId}</span>
                      <StatusBadge
                        configured={isActiveRunState(run.state)}
                        configuredLabel={run.state}
                        notConfiguredLabel={run.state}
                      />
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--ds-text-tertiary)' }}>
                      {run.toolName ? `${t('sidepanel.projectsPage.knowledgeRunTool')}: ${run.toolName} · ` : ''}
                      {t('sidepanel.projectsPage.knowledgeRunUpdated', { time: formatTimestamp(run.updatedAt) })}
                    </div>
                    {run.errorCode && (
                      <div className="text-[10px]" style={{ color: 'var(--ds-danger)' }}>
                        {t('sidepanel.projectsPage.knowledgeRunError', { error: run.errorCode })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function KnowledgeRecordCard({
  record,
  kindLabel,
  statusLabels,
  resolutionStatus,
  busy,
  onStatusChange,
  onResolve,
}: {
  record: ProjectKnowledgeRecordSummary;
  kindLabel: string;
  statusLabels: Record<ProjectKnowledgeStatus, string>;
  resolutionStatus: ProjectKnowledgeStatus;
  busy: boolean;
  onStatusChange: (status: ProjectKnowledgeStatus) => void;
  onResolve: () => void;
}) {
  const { t } = useI18n();
  return (
    <article className="rounded-lg border px-3 py-2.5 space-y-2" style={{ borderColor: 'var(--ds-border)', background: 'var(--ds-bg)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ds-text-tertiary)' }}>{kindLabel}</span>
            <StatusBadge
              configured={record.status === 'confirmed'}
              configuredLabel={statusLabels[record.status]}
              notConfiguredLabel={statusLabels[record.status]}
            />
          </div>
          <div className="text-[11px] mt-1 whitespace-pre-wrap break-words" style={{ color: 'var(--ds-text)' }}>{record.content}</div>
        </div>
        <span className="text-[10px] shrink-0" style={{ color: 'var(--ds-text-tertiary)' }}>
          #{record.revision}
        </span>
      </div>

      <div className="rounded-md px-2 py-1.5 space-y-1" style={{ background: 'var(--ds-surface)' }}>
        <div className="text-[10px] font-semibold" style={{ color: 'var(--ds-text-secondary)' }}>
          {t('sidepanel.projectsPage.knowledgeProvenance')}
        </div>
        <div className="text-[10px] break-all" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.projectsPage.knowledgeConversation')}: {record.conversationId}
        </div>
        <ProvenanceRefs label={t('sidepanel.projectsPage.knowledgeSources')} refs={record.sourceRefs} />
        <ProvenanceRefs label={t('sidepanel.projectsPage.knowledgeEvidence')} refs={record.evidenceRefs} />
        <div className="text-[10px]" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.projectsPage.knowledgeUpdated', { time: formatTimestamp(record.updatedAt) })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.projectsPage.knowledgeResolutionStatus')}
          <select
            value={resolutionStatus}
            onChange={(event) => onStatusChange(event.target.value as ProjectKnowledgeStatus)}
            className="px-1.5 py-1 text-[10px] rounded border outline-none"
            style={inputStyle}
          >
            {KNOWLEDGE_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={onResolve}
          disabled={busy || resolutionStatus === record.status}
          className="ds-btn-secondary px-2 py-1 text-[10px] rounded-md disabled:opacity-40"
        >
          {busy && <Spinner className="w-3 h-3 mr-1 align-[-2px]" />}
          {t('sidepanel.projectsPage.knowledgeResolve')}
        </button>
      </div>
    </article>
  );
}

function ProvenanceRefs({ label, refs }: { label: string; refs: readonly string[] }) {
  return (
    <div className="text-[10px] break-all" style={{ color: 'var(--ds-text-tertiary)' }}>
      {label}: {refs.length ? refs.join(', ') : '—'}
    </div>
  );
}

function isActiveRunState(state: string): boolean {
  return state === 'queued' || state === 'running' || state === 'pending';
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '—';
  return new Date(timestamp).toLocaleString();
}

function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function decodeProjectKnowledgeQueryResult(value: unknown): ProjectKnowledgeQueryResult {
  const object = asRecord(value, 'PROJECT_KNOWLEDGE_QUERY response');
  return {
    records: arrayValue(object.records, 'records').map((record, index) => decodeProjectKnowledgeRecord(record, `records[${index}]`)),
    runs: arrayValue(object.runs, 'runs').map((run, index) => decodeProjectKnowledgeRun(run, `runs[${index}]`)),
    sharing: decodeProjectKnowledgeSharing(object.sharing, 'sharing'),
  };
}

export function decodeProjectKnowledgeRuns(value: unknown): readonly ProjectKnowledgeRunSummary[] {
  return arrayValue(value, 'PROJECT_RUNS_LIST response').map((run, index) => decodeProjectKnowledgeRun(run, `[${index}]`));
}

export function decodeProjectKnowledgeExportBundle(value: unknown): ProjectKnowledgeExportBundle {
  return decodeProjectContextExport(value, 'project knowledge export');
}

function decodeProjectKnowledgeRecord(value: unknown, path: string): ProjectKnowledgeRecordSummary {
  const object = asRecord(value, path);
  const kind = stringValue(object.kind, `${path}.kind`);
  const status = stringValue(object.status, `${path}.status`);
  if (!KNOWLEDGE_KINDS.includes(kind as ProjectKnowledgeRecordKind)) throw new Error(`${path}.kind is invalid.`);
  if (!KNOWLEDGE_STATUSES.includes(status as ProjectKnowledgeStatus)) throw new Error(`${path}.status is invalid.`);
  return {
    id: stringValue(object.id, `${path}.id`),
    projectId: stringValue(object.projectId, `${path}.projectId`),
    conversationId: stringValue(object.conversationId, `${path}.conversationId`),
    kind: kind as ProjectKnowledgeRecordKind,
    content: stringValue(object.content, `${path}.content`),
    status: status as ProjectKnowledgeStatus,
    sourceRefs: stringArray(object.sourceRefs, `${path}.sourceRefs`),
    evidenceRefs: stringArray(object.evidenceRefs, `${path}.evidenceRefs`),
    createdAt: numberValue(object.createdAt, `${path}.createdAt`),
    updatedAt: numberValue(object.updatedAt, `${path}.updatedAt`),
    revision: numberValue(object.revision, `${path}.revision`),
    ...(object.supersedesId === undefined ? {} : { supersedesId: stringValue(object.supersedesId, `${path}.supersedesId`) }),
  };
}

function decodeProjectKnowledgeRun(value: unknown, path: string): ProjectKnowledgeRunSummary {
  const object = asRecord(value, path);
  return {
    runId: stringValue(object.runId, `${path}.runId`),
    projectId: stringValue(object.projectId, `${path}.projectId`),
    conversationId: stringValue(object.conversationId, `${path}.conversationId`),
    state: stringValue(object.state, `${path}.state`),
    startedAt: numberValue(object.startedAt, `${path}.startedAt`),
    updatedAt: numberValue(object.updatedAt, `${path}.updatedAt`),
    ...(object.toolName === undefined ? {} : { toolName: stringValue(object.toolName, `${path}.toolName`) }),
    ...(object.errorCode === undefined ? {} : { errorCode: stringValue(object.errorCode, `${path}.errorCode`) }),
  };
}

function decodeProjectKnowledgeSharing(value: unknown, path: string): ProjectKnowledgeSharingState {
  const object = asRecord(value, path);
  return {
    projectId: stringValue(object.projectId, `${path}.projectId`),
    excludedConversationIds: stringArray(object.excludedConversationIds, `${path}.excludedConversationIds`),
    revision: numberValue(object.revision, `${path}.revision`),
  };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return value;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string.`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error(`${path} must be a string array.`);
  return value as string[];
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`);
  return value;
}

const inputStyle = {
  background: 'var(--ds-bg)',
  borderColor: 'var(--ds-border)',
  color: 'var(--ds-text)',
};
