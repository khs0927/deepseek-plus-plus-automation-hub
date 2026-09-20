import { describe, expect, it } from 'vitest';
import {
  authorizeProjectExecution,
  createProjectExecutionPolicy,
  isPathWithinApprovedRoots,
  isProjectMcpServerAllowed,
  isProjectMcpToolAllowed,
  isProjectPathApproved,
  isProjectShellToolAllowed,
  normalizeProjectPath,
  tryNormalizeProjectPath,
} from '../core/project/execution-policy';

describe('project execution policy', () => {
  it('canonicalizes roots and capability collections deterministically', () => {
    const policy = createProjectExecutionPolicy({
      projectId: ' project-1 ',
      approvedRoots: ['C:\\Work\\repo\\', 'C:\\Work\\repo', 'C:\\Work\\other'],
      mcp: {
        serverIds: ['z-server', 'a-server', 'z-server'],
        toolNamesByServer: {
          'z-server': ['write', 'read', 'read'],
          'a-server': ['status'],
        },
      },
      shell: { enabled: true, toolNames: ['shell_exec', 'shell_exec', 'local_file_read'] },
    });

    expect(policy).toEqual({
      version: 1,
      projectId: 'project-1',
      approvedRoots: ['C:/Work/other', 'C:/Work/repo'],
      mcp: {
        serverIds: ['a-server', 'z-server'],
        toolNamesByServer: {
          'a-server': ['status'],
          'z-server': ['read', 'write'],
        },
      },
      shell: { enabled: true, toolNames: ['local_file_read', 'shell_exec'] },
    });
  });

  it('normalizes local paths and rejects traversal, relative paths, and URIs', () => {
    expect(normalizeProjectPath('c:\\Work\\repo\\src\\..\\README.md')).toBe('C:/Work/repo/README.md');
    expect(normalizeProjectPath('/workspace/project/./src//main.ts')).toBe('/workspace/project/src/main.ts');
    expect(tryNormalizeProjectPath('workspace/project')).toBeNull();
    expect(tryNormalizeProjectPath('file:///workspace/project')).toBeNull();
    expect(tryNormalizeProjectPath('C:\\Work\\..\\..\\escape')).toBeNull();
    expect(tryNormalizeProjectPath('C:\\Work\\repo\\a\0b')).toBeNull();
  });

  it('uses path-segment containment, not string-prefix containment', () => {
    expect(isPathWithinApprovedRoots(['C:\\Work\\repo'], 'c:\\work\\repo\\src\\index.ts')).toBe(true);
    expect(isPathWithinApprovedRoots(['C:\\Work\\repo'], 'C:\\Work\\repository\\secret.txt')).toBe(false);
    expect(isPathWithinApprovedRoots(['/workspace/project'], '/workspace/project')).toBe(true);
    expect(isPathWithinApprovedRoots(['/workspace/project'], '/workspace/project-old/file')).toBe(false);

    const policy = createProjectExecutionPolicy({
      projectId: 'p1',
      approvedRoots: ['C:\\Work\\repo'],
    });
    expect(isProjectPathApproved(policy, 'C:\\WORK\\REPO\\src')).toBe(true);
  });

  it('requires persisted server enablement and explicit project server/tool entries', () => {
    const policy = createProjectExecutionPolicy({
      projectId: 'p1',
      mcp: {
        serverIds: ['server-a'],
        toolNamesByServer: { 'server-a': ['read_file'] },
      },
    });
    const disabled = { id: 'server-a', enabled: false };
    const enabled = { id: 'server-a', enabled: true };

    expect(isProjectMcpServerAllowed(policy, disabled)).toBe(false);
    expect(isProjectMcpServerAllowed(policy, enabled)).toBe(true);
    expect(isProjectMcpToolAllowed(policy, enabled, 'read_file')).toBe(true);
    expect(isProjectMcpToolAllowed(policy, enabled, 'write_file')).toBe(false);
    expect(isProjectMcpToolAllowed(policy, { id: 'server-b', enabled: true }, 'read_file')).toBe(false);
  });

  it('keeps Shell separate from MCP and defaults both capabilities to deny', () => {
    const defaultPolicy = createProjectExecutionPolicy({ projectId: 'p1' });
    expect(isProjectShellToolAllowed(defaultPolicy, 'shell_exec')).toBe(false);
    expect(isProjectMcpServerAllowed(defaultPolicy, { id: 'server-a', enabled: true })).toBe(false);

    const policy = createProjectExecutionPolicy({
      projectId: 'p1',
      mcp: { serverIds: ['server-a'], toolNamesByServer: { 'server-a': ['read'] } },
      shell: { enabled: true, toolNames: ['shell_exec'] },
    });
    expect(isProjectShellToolAllowed(policy, 'shell_exec')).toBe(true);
    expect(isProjectMcpToolAllowed(policy, { id: 'server-a', enabled: true }, 'shell_exec')).toBe(false);
  });

  it('authorizes only trusted policy subjects and validates candidate paths', () => {
    const policy = createProjectExecutionPolicy({
      projectId: 'p1',
      approvedRoots: ['C:\\Work\\repo'],
      mcp: { serverIds: ['server-a'], toolNamesByServer: { 'server-a': ['read_file'] } },
      shell: { enabled: true, toolNames: ['local_file_read'] },
    });
    const server = { id: 'server-a', enabled: true };

    expect(authorizeProjectExecution(policy, {
      capability: 'mcp',
      server,
      toolName: 'read_file',
      path: 'C:\\Work\\repo\\src\\main.ts',
    })).toEqual({ allowed: true, normalizedPath: 'C:/Work/repo/src/main.ts' });
    expect(authorizeProjectExecution(policy, {
      capability: 'mcp',
      server,
      toolName: 'read_file',
      path: 'C:\\Work\\repo-old\\secret.txt',
    })).toEqual({ allowed: false, reason: 'path_outside_approved_roots' });
    expect(authorizeProjectExecution(policy, {
      capability: 'shell',
      toolName: 'local_file_read',
      path: 'not-absolute',
    })).toEqual({ allowed: false, reason: 'path_invalid' });
  });
});
