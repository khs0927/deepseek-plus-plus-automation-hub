import { useEffect, useMemo, useState } from 'react';
import { createProjectExecutionPolicy, type ProjectExecutionPolicy } from '../../../core/project/execution-policy';
import { decodeMcpStorageState, MCP_STORAGE_VERSION } from '../../../core/mcp/storage-codec';
import type { McpServerConfig } from '../../../core/mcp/types';
import { useI18n } from '../i18n';
import { sidepanelRuntimeClient } from '../runtime-client';
import { getRuntimeErrorMessage } from '../runtime-response';
import { useBanner } from './settings/primitives';

const SHELL_TOOLS = [
  'shell_exec', 'shell_status', 'shell_session_begin', 'shell_session_exec', 'shell_session_end',
  'task_spawn', 'task_status', 'task_kill', 'task_list',
  'local_file_read', 'local_file_write', 'local_file_stat', 'local_dir_list', 'local_file_search',
  'local_folder_pick', 'local_skill_preview',
] as const;

export interface ProjectExecutionPolicyPanelProps {
  projectId: string;
}

export default function ProjectExecutionPolicyPanel({ projectId }: ProjectExecutionPolicyPanelProps) {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<ProjectExecutionPolicy | null>(null);
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [rootsText, setRootsText] = useState('');
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const [toolsByServer, setToolsByServer] = useState<Record<string, string>>({});
  const [shellEnabled, setShellEnabled] = useState(false);
  const [shellTools, setShellTools] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const banner = useBanner();

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      sidepanelRuntimeClient.request(
        { type: 'GET_PROJECT_EXECUTION_POLICY', payload: { projectId } },
        { decode: decodePolicy },
      ),
      sidepanelRuntimeClient.request(
        { type: 'GET_MCP_SERVERS' },
        { decode: decodeServers },
      ),
    ]).then(([nextPolicy, nextServers]) => {
      if (!active) return;
      setPolicy(nextPolicy);
      setServers(nextServers);
      setRootsText(nextPolicy?.approvedRoots.join('\n') ?? '');
      setSelectedServers(new Set(nextPolicy?.mcp.serverIds ?? []));
      setToolsByServer(Object.fromEntries(
        Object.entries(nextPolicy?.mcp.toolNamesByServer ?? {}).map(([id, names]) => [id, names.join(', ')]),
      ));
      setShellEnabled(nextPolicy?.shell.enabled ?? false);
      setShellTools(nextPolicy?.shell.toolNames.join(', ') ?? '');
    }).catch((error) => {
      if (active) banner.show('error', t('sidepanel.projectsPage.policyOperationFailed', { error: getRuntimeErrorMessage(error) }));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [projectId, t]);

  const enabledServers = useMemo(
    () => servers.filter((server) => server.enabled),
    [servers],
  );

  async function save() {
    setSaving(true);
    banner.clear();
    try {
      const approvedRoots = splitLines(rootsText);
      if (approvedRoots.length === 0) throw new Error(t('sidepanel.projectsPage.policyRootRequired'));
      const next = await sidepanelRuntimeClient.request({
        type: 'SAVE_PROJECT_EXECUTION_POLICY',
        payload: {
          projectId,
          approvedRoots,
          mcp: {
            serverIds: [...selectedServers],
            toolNamesByServer: Object.fromEntries(
              [...selectedServers].map((serverId) => [serverId, splitNames(toolsByServer[serverId] ?? '')]),
            ),
          },
          shell: { enabled: shellEnabled, toolNames: splitNames(shellTools) },
        },
      }, { decode: decodePolicyRequired });
      setPolicy(next);
      banner.show('success', t('sidepanel.projectsPage.policySaved'));
    } catch (error) {
      banner.show('error', t('sidepanel.projectsPage.policyOperationFailed', { error: getRuntimeErrorMessage(error) }));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await sidepanelRuntimeClient.request(
        { type: 'DELETE_PROJECT_EXECUTION_POLICY', payload: { projectId } },
        { decode: decodeAck },
      );
      setPolicy(null);
      banner.show('success', t('sidepanel.projectsPage.policyDeleted'));
    } catch (error) {
      banner.show('error', t('sidepanel.projectsPage.policyOperationFailed', { error: getRuntimeErrorMessage(error) }));
    } finally {
      setSaving(false);
    }
  }

  function toggleServer(serverId: string) {
    setSelectedServers((current) => {
      const next = new Set(current);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  }

  return (
    <section className="ds-surface-panel rounded-xl p-4 space-y-3">
      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--ds-text)' }}>
          {t('sidepanel.projectsPage.policyTitle')}
        </div>
        <div className="text-[11px] mt-1" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.projectsPage.policyDescription')}
        </div>
        {!policy && !loading && (
          <div className="text-[11px] mt-2 rounded-lg border px-2 py-1.5" style={{ borderColor: 'var(--ds-danger, #ef4444)', color: 'var(--ds-danger, #ef4444)' }}>
            {t('sidepanel.projectsPage.policyNotConfigured')}
          </div>
        )}
      </div>
      {banner.node}
      {loading ? <div className="text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>{t('common.loading')}</div> : (
        <>
          <label className="block text-[11px]" style={{ color: 'var(--ds-text-secondary)' }}>
            {t('sidepanel.projectsPage.policyRoots')}
            <textarea
              value={rootsText}
              onChange={(event) => setRootsText(event.target.value)}
              placeholder={t('sidepanel.projectsPage.policyRootsPlaceholder')}
              className="mt-1 w-full min-h-[68px] px-3 py-2 text-xs rounded-lg border outline-none font-mono"
              style={inputStyle}
            />
          </label>
          <div className="space-y-2">
            <div className="text-[11px]" style={{ color: 'var(--ds-text-secondary)' }}>{t('sidepanel.projectsPage.policyMcp')}</div>
            {enabledServers.length === 0 ? (
              <div className="text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>{t('sidepanel.projectsPage.policyNoServers')}</div>
            ) : enabledServers.map((server) => (
              <div key={server.id} className="rounded-lg border p-2 space-y-2" style={{ borderColor: 'var(--ds-border)' }}>
                <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ds-text)' }}>
                  <input type="checkbox" checked={selectedServers.has(server.id)} onChange={() => toggleServer(server.id)} />
                  <span className="truncate">{server.displayName}</span>
                </label>
                {selectedServers.has(server.id) && (
                  <input
                    value={toolsByServer[server.id] ?? ''}
                    onChange={(event) => setToolsByServer((current) => ({ ...current, [server.id]: event.target.value }))}
                    placeholder={t('sidepanel.projectsPage.policyToolsPlaceholder')}
                    className="w-full px-2 py-1 text-[11px] rounded border outline-none font-mono"
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="rounded-lg border p-2 space-y-2" style={{ borderColor: 'var(--ds-border)' }}>
            <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ds-text)' }}>
              <input type="checkbox" checked={shellEnabled} onChange={(event) => setShellEnabled(event.target.checked)} />
              {t('sidepanel.projectsPage.policyShell')}
            </label>
            <input
              value={shellTools}
              onChange={(event) => setShellTools(event.target.value)}
              placeholder={SHELL_TOOLS.slice(0, 4).join(', ')}
              className="w-full px-2 py-1 text-[11px] rounded border outline-none font-mono"
              style={inputStyle}
              disabled={!shellEnabled}
            />
            <div className="text-[10px]" style={{ color: 'var(--ds-text-tertiary)' }}>{t('sidepanel.projectsPage.policyShellHint')}</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={saving} className="ds-btn-primary px-3 py-2 text-xs rounded-lg disabled:opacity-40">
              {t('sidepanel.projectsPage.policySave')}
            </button>
            {policy && <button type="button" onClick={() => void remove()} disabled={saving} className="ds-btn-secondary px-3 py-2 text-xs rounded-lg disabled:opacity-40">
              {t('sidepanel.projectsPage.policyRemove')}
            </button>}
          </div>
        </>
      )}
    </section>
  );
}

const inputStyle = {
  background: 'var(--ds-bg)',
  borderColor: 'var(--ds-border)',
  color: 'var(--ds-text)',
};

function splitLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
}
function splitNames(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}
function decodePolicy(value: unknown): ProjectExecutionPolicy | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid project execution policy.');
  const input = value as ProjectExecutionPolicy;
  return createProjectExecutionPolicy(input);
}
function decodePolicyRequired(value: unknown): ProjectExecutionPolicy {
  const policy = decodePolicy(value);
  if (!policy) throw new Error('Project execution policy was not saved.');
  return policy;
}
function decodeServers(value: unknown): McpServerConfig[] {
  if (!Array.isArray(value)) throw new Error('Invalid MCP server response.');
  return decodeMcpStorageState({ version: MCP_STORAGE_VERSION, servers: value, toolCaches: [] }).servers;
}
function decodeAck(value: unknown): { ok: true } {
  if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) throw new Error('Operation failed.');
  return { ok: true };
}
