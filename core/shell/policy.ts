import type { McpServerConfig, McpServerCreateInput, McpToolAllowlist } from '../mcp/types';
import { DEFAULT_MCP_REQUEST_TIMEOUT_MS } from '../mcp/config';
import { SHELL_MCP_NATIVE_HOST, SHELL_MCP_SERVER_NAME } from './contracts';

export interface ShellMcpPresetOptions {
  nativeHost?: string;
  enabled?: boolean;
  executionEnabled?: boolean;
  // When provided, overrides the default request timeout on the preset. The
  // caller (e.g. background startup) typically passes the globally configured
  // MCP request timeout so the Shell local preset does not hardcode 120s.
  requestMs?: number;
}

/**
 * Policy inspection never mutates the persisted allowlist. Accepting a
 * readonly view keeps this API compatible with readonly tuples and immutable
 * callers without changing the storage-facing MCP contract.
 */
export interface ShellAllowlistPolicyInput {
  readonly mode: McpToolAllowlist['mode'];
  readonly toolNames: readonly string[];
}

export const DEFAULT_SHELL_MCP_ALLOWLIST_TOOL_NAMES = [
  'shell_status',
  'python_status',
  'local_skill_preview',
  'local_folder_pick',
] as const;

export const LOCAL_SKILL_SHELL_TOOL_NAMES = [
  'local_skill_preview',
  'local_folder_pick',
] as const;

export const LOCAL_FILE_SHELL_TOOL_NAMES = [
  'local_file_stat',
  'local_file_read',
  'local_file_write',
  'local_dir_list',
  'local_file_search',
] as const;

export const TASK_SHELL_TOOL_NAMES = [
  'task_spawn',
  'task_status',
  'task_kill',
  'task_list',
] as const;

export function createShellMcpPresetInput(
  options: ShellMcpPresetOptions = {},
): McpServerCreateInput {
  return {
    displayName: SHELL_MCP_SERVER_NAME,
    enabled: options.enabled ?? false,
    transport: {
      kind: 'native_messaging',
      nativeHost: options.nativeHost ?? SHELL_MCP_NATIVE_HOST,
    },
    headers: [],
    secrets: [],
    timeouts: {
      connectMs: 5_000,
      requestMs: options.requestMs ?? DEFAULT_MCP_REQUEST_TIMEOUT_MS,
      discoveryMs: 10_000,
    },
    limits: {
      maxResultBytes: 128_000,
      maxToolCount: 128,
    },
    allowlist: {
      mode: 'allow',
      toolNames: [...DEFAULT_SHELL_MCP_ALLOWLIST_TOOL_NAMES],
    },
    execution: {
      enabled: options.executionEnabled ?? false,
      mode: 'auto',
    },
  };
}

export function isShellMcpServer(
  server: Pick<McpServerConfig, 'displayName' | 'transport'>,
): boolean {
  return server.transport.kind === 'native_messaging' && (
    server.displayName === SHELL_MCP_SERVER_NAME ||
    server.transport.nativeHost === SHELL_MCP_NATIVE_HOST
  );
}

/**
 * Evaluates an existing allowlist without changing it.  Privileged Shell
 * capabilities must be explicitly approved by the user; callers must not
 * turn a missing entry into an implicit allowlist upgrade.
 */
export function isShellToolAllowedByAllowlist(
  allowlist: ShellAllowlistPolicyInput,
  toolName: string,
): boolean {
  if (allowlist.mode === 'all') return true;
  const listed = allowlist.toolNames.includes(toolName);
  return allowlist.mode === 'allow' ? listed : !listed;
}

export function buildShellLimitsUpgrade(
  limits?: McpServerConfig['limits'],
): McpServerConfig['limits'] | null {
  if (!limits) {
    return { maxResultBytes: 128_000, maxToolCount: 128 };
  }
  if ((limits.maxToolCount ?? 0) >= 32) return null;
  return {
    ...limits,
    maxToolCount: 128,
  };
}
