/**
 * Project-scoped execution policy.
 *
 * This module is deliberately a pure policy boundary. It does not read or
 * write project state, enable MCP servers, inspect tool payloads, or resolve
 * filesystem symlinks. Callers must supply the already trusted project policy
 * and the persisted MCP server state; a model/page payload can only ever be a
 * candidate value (for example, a path) checked against this policy.
 */

import type { McpServerConfig } from '../mcp/types';

export const PROJECT_EXECUTION_POLICY_VERSION = 1 as const;

export type ProjectExecutionCapability = 'mcp' | 'shell';

export interface ProjectMcpCapabilityAllowlistInput {
  /** Explicitly permitted persisted MCP server IDs. Omitted means none. */
  serverIds?: readonly string[];
  /** Explicitly permitted tool names for each persisted MCP server ID. */
  toolNamesByServer?: Readonly<Record<string, readonly string[]>>;
}

export interface ProjectShellCapabilityInput {
  /** Shell is a separate project capability; it is never implied by MCP. */
  enabled?: boolean;
  /** Explicitly permitted Shell tool names. Omitted means none. */
  toolNames?: readonly string[];
}

export interface ProjectExecutionPolicyInput {
  projectId: string;
  /** Absolute project roots. Relative paths and URI-looking values are rejected. */
  approvedRoots?: readonly string[];
  mcp?: ProjectMcpCapabilityAllowlistInput;
  shell?: ProjectShellCapabilityInput;
}

export interface ProjectMcpCapabilityAllowlist {
  readonly serverIds: readonly string[];
  readonly toolNamesByServer: Readonly<Record<string, readonly string[]>>;
}

export interface ProjectShellCapability {
  readonly enabled: boolean;
  readonly toolNames: readonly string[];
}

export interface ProjectExecutionPolicy {
  readonly version: typeof PROJECT_EXECUTION_POLICY_VERSION;
  readonly projectId: string;
  readonly approvedRoots: readonly string[];
  readonly mcp: ProjectMcpCapabilityAllowlist;
  readonly shell: ProjectShellCapability;
}

export interface ProjectMcpServerSubject {
  id: string;
  /** This must come from the persisted MCP server, never a model payload. */
  enabled: boolean;
}

export interface ProjectShellExecutionSubject {
  toolName: string;
  path?: string;
}

export interface ProjectMcpExecutionSubject {
  server: ProjectMcpServerSubject | Pick<McpServerConfig, 'id' | 'enabled'>;
  toolName: string;
  path?: string;
}

export type ProjectExecutionSubject =
  | ({ capability: 'mcp' } & ProjectMcpExecutionSubject)
  | ({ capability: 'shell' } & ProjectShellExecutionSubject);

export type ProjectExecutionDenialReason =
  | 'project_mismatch'
  | 'policy_not_configured'
  | 'mcp_server_not_allowlisted'
  | 'mcp_server_disabled'
  | 'mcp_tool_not_allowlisted'
  | 'shell_disabled'
  | 'shell_tool_not_allowlisted'
  | 'path_invalid'
  | 'path_outside_approved_roots';

export interface ProjectExecutionDecision {
  readonly allowed: boolean;
  readonly reason?: ProjectExecutionDenialReason;
  readonly normalizedPath?: string;
}

const EMPTY_TOOL_NAMES: readonly string[] = Object.freeze([]);
const EMPTY_SERVER_IDS: readonly string[] = Object.freeze([]);

/**
 * Builds a canonical, immutable policy. All unordered collections are sorted
 * and deduplicated, so equivalent inputs produce byte-stable JSON when the
 * returned object is serialized.
 */
export function createProjectExecutionPolicy(
  input: ProjectExecutionPolicyInput,
): ProjectExecutionPolicy {
  const projectId = normalizeRequiredIdentifier(input.projectId, 'projectId');
  const approvedRoots = canonicalizeRoots(input.approvedRoots ?? EMPTY_TOOL_NAMES);
  const serverIds = canonicalizeIdentifiers(input.mcp?.serverIds ?? EMPTY_SERVER_IDS, 'mcp.serverIds');
  const configuredTools: Record<string, readonly string[]> = {};
  for (const [rawServerId, toolNames] of Object.entries(input.mcp?.toolNamesByServer ?? {})) {
    const serverId = normalizeRequiredIdentifier(rawServerId, 'mcp.toolNamesByServer server id');
    configuredTools[serverId] = [
      ...(configuredTools[serverId] ?? EMPTY_TOOL_NAMES),
      ...toolNames,
    ];
  }
  const serverIdsFromTools = Object.keys(configuredTools);
  const canonicalServerIds = canonicalizeIdentifiers(
    [...serverIds, ...serverIdsFromTools],
    'mcp.serverIds',
  );
  const toolNamesByServerEntries: Array<[string, readonly string[]]> = [];
  for (const serverId of canonicalServerIds) {
    const configured = configuredTools[serverId] ?? EMPTY_TOOL_NAMES;
    toolNamesByServerEntries.push([
      serverId,
      canonicalizeIdentifiers(configured, `mcp.toolNamesByServer.${serverId}`),
    ]);
  }
  const toolNamesByServer = Object.freeze(Object.fromEntries(toolNamesByServerEntries));

  const shellToolNames = canonicalizeIdentifiers(
    input.shell?.toolNames ?? EMPTY_TOOL_NAMES,
    'shell.toolNames',
  );
  const policy: ProjectExecutionPolicy = {
    version: PROJECT_EXECUTION_POLICY_VERSION,
    projectId,
    approvedRoots,
    mcp: {
      serverIds: Object.freeze(canonicalServerIds),
      toolNamesByServer,
    },
    shell: {
      enabled: input.shell?.enabled === true,
      toolNames: shellToolNames,
    },
  };

  return Object.freeze(policy);
}

/**
 * Normalizes an absolute local path without touching the filesystem.
 *
 * Windows drive paths and UNC paths are compared case-insensitively; POSIX
 * paths retain case. The result uses `/` separators and has no trailing slash
 * except for a filesystem root. URI schemes, NULs, relative paths, and paths
 * that traverse above their root are rejected.
 */
export function normalizeProjectPath(value: string): string {
  if (typeof value !== 'string') throw new Error('Project path must be a string.');
  const input = value.trim();
  if (!input) throw new Error('Project path must not be empty.');
  if (input.includes('\0')) throw new Error('Project path must not contain NUL.');
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
    throw new Error('Project paths must be local filesystem paths, not URIs.');
  }

  const slashPath = input.replace(/\\/g, '/');
  const windowsDrive = /^[a-zA-Z]:\//.test(slashPath);
  const unc = slashPath.startsWith('//');
  const posix = slashPath.startsWith('/') && !windowsDrive && !unc;
  if (!windowsDrive && !unc && !posix) {
    throw new Error('Project path must be absolute.');
  }
  if (windowsDrive && !/^[a-zA-Z]:\//.test(slashPath)) {
    throw new Error('Drive-relative project paths are not allowed.');
  }

  const prefix = windowsDrive
    ? `${slashPath[0].toUpperCase()}:/`
    : unc
      ? '//'
      : '/';
  const body = windowsDrive
    ? slashPath.slice(3)
    : unc
      ? slashPath.slice(2)
      : slashPath.slice(1);
  const segments = body.split('/');
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (normalized.length === 0) throw new Error('Project path traverses above its root.');
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }

  if (unc && normalized.length < 2) {
    throw new Error('UNC project paths must include a server and share.');
  }
  const normalizedBody = normalized.join('/');
  if (windowsDrive) return normalizedBody ? `${prefix}${normalizedBody}` : prefix;
  if (unc) return normalizedBody ? `//${normalizedBody}` : '//';
  return normalizedBody ? `/${normalizedBody}` : '/';
}

export function tryNormalizeProjectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    return normalizeProjectPath(value);
  } catch {
    return null;
  }
}

/** Returns true when candidate is the root itself or a descendant of a root. */
export function isPathWithinApprovedRoots(
  approvedRoots: readonly string[],
  candidatePath: string,
): boolean {
  const candidate = tryNormalizeProjectPath(candidatePath);
  if (!candidate) return false;
  return approvedRoots.some((root) => {
    const normalizedRoot = tryNormalizeProjectPath(root);
    return normalizedRoot !== null && isPathWithinRoot(normalizedRoot, candidate);
  });
}

export function isProjectPathApproved(
  policy: ProjectExecutionPolicy,
  candidatePath: string,
): boolean {
  return isPathWithinApprovedRoots(policy.approvedRoots, candidatePath);
}

/**
 * A project allowlist cannot turn a disabled MCP server on. `server.enabled`
 * is intentionally required here so an integration cannot accidentally use
 * project configuration as an implicit server-enable operation.
 */
export function isProjectMcpServerAllowed(
  policy: ProjectExecutionPolicy,
  server: ProjectMcpServerSubject | Pick<McpServerConfig, 'id' | 'enabled'>,
): boolean {
  if (server.enabled !== true) return false;
  const serverId = tryNormalizeIdentifier(server.id);
  return serverId !== null && policy.mcp.serverIds.includes(serverId);
}

export function isProjectMcpToolAllowed(
  policy: ProjectExecutionPolicy,
  server: ProjectMcpServerSubject | Pick<McpServerConfig, 'id' | 'enabled'>,
  toolName: string,
): boolean {
  const serverId = tryNormalizeIdentifier(server.id);
  const tool = tryNormalizeIdentifier(toolName);
  if (serverId === null || tool === null || !isProjectMcpServerAllowed(policy, server)) return false;
  return policy.mcp.toolNamesByServer[serverId]?.includes(tool) === true;
}

/** Shell is evaluated independently from MCP server policy. */
export function isProjectShellToolAllowed(
  policy: ProjectExecutionPolicy,
  toolName: string,
): boolean {
  const tool = tryNormalizeIdentifier(toolName);
  return policy.shell.enabled && tool !== null && policy.shell.toolNames.includes(tool);
}

export function authorizeProjectExecution(
  policy: ProjectExecutionPolicy,
  subject: ProjectExecutionSubject,
): ProjectExecutionDecision {
  if (subject.capability === 'mcp') {
    if (subject.server.enabled !== true) {
      return { allowed: false, reason: 'mcp_server_disabled' };
    }
    if (!isProjectMcpServerAllowed(policy, subject.server)) {
      return { allowed: false, reason: 'mcp_server_not_allowlisted' };
    }
    if (!isProjectMcpToolAllowed(policy, subject.server, subject.toolName)) {
      return { allowed: false, reason: 'mcp_tool_not_allowlisted' };
    }
  } else {
    if (!policy.shell.enabled) return { allowed: false, reason: 'shell_disabled' };
    if (!isProjectShellToolAllowed(policy, subject.toolName)) {
      return { allowed: false, reason: 'shell_tool_not_allowlisted' };
    }
  }

  if (subject.path !== undefined) {
    const normalizedPath = tryNormalizeProjectPath(subject.path);
    if (!normalizedPath) return { allowed: false, reason: 'path_invalid' };
    if (!isProjectPathApproved(policy, normalizedPath)) {
      return { allowed: false, reason: 'path_outside_approved_roots' };
    }
    return { allowed: true, normalizedPath };
  }
  return { allowed: true };
}

function canonicalizeRoots(values: readonly string[]): readonly string[] {
  const normalized = values.map((value) => normalizeProjectPath(value));
  return Object.freeze(sortAndDedupe(normalized, pathSortKey));
}

function canonicalizeIdentifiers(values: readonly string[], label: string): readonly string[] {
  const normalized = values.map((value) => normalizeRequiredIdentifier(value, label));
  return Object.freeze(sortAndDedupe(normalized, (value) => value));
}

function normalizeRequiredIdentifier(value: unknown, label: string): string {
  const normalized = tryNormalizeIdentifier(value);
  if (normalized === null) throw new Error(`${label} must be a non-empty string.`);
  return normalized;
}

function tryNormalizeIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function sortAndDedupe(values: readonly string[], key: (value: string) => string): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const normalizedKey = key(value);
    if (!unique.has(normalizedKey)) unique.set(normalizedKey, value);
  }
  return [...unique.values()].sort((left, right) => compareStrings(key(left), key(right)));
}

function pathSortKey(value: string): string {
  return isCaseInsensitivePath(value) ? value.toLowerCase() : value;
}

function isPathWithinRoot(root: string, candidate: string): boolean {
  if (isCaseInsensitivePath(root) !== isCaseInsensitivePath(candidate)) return false;
  const left = pathSortKey(root);
  const right = pathSortKey(candidate);
  return right === left || right.startsWith(left.endsWith('/') ? left : `${left}/`);
}

function isCaseInsensitivePath(value: string): boolean {
  return /^[A-Z]:\//.test(value) || value.startsWith('//');
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
