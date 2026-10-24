import { describe, expect, it } from 'vitest';
import {
  buildShellLimitsUpgrade,
  createShellMcpPresetInput,
  DEFAULT_SHELL_MCP_ALLOWLIST_TOOL_NAMES,
  isShellToolAllowedByAllowlist,
  isShellMcpServer,
} from '../core/shell/policy';
import { DEFAULT_MCP_REQUEST_TIMEOUT_MS } from '../core/mcp/config';
import type { McpToolAllowlist } from '../core/mcp/types';
import { SHELL_TOOL_NAMES } from '../core/shell/contracts';

describe('createShellMcpPresetInput', () => {
  it('defaults Shell MCP to auto execution while disabled by default', () => {
    const preset = createShellMcpPresetInput();

    expect(preset.enabled).toBe(false);
    expect(preset.allowlist).toEqual({ mode: 'allow', toolNames: [...DEFAULT_SHELL_MCP_ALLOWLIST_TOOL_NAMES] });
    expect(preset.execution).toEqual({ enabled: false, mode: 'auto' });
  });

  it('uses the default MCP request timeout unless explicitly overridden', () => {
    expect(createShellMcpPresetInput().timeouts?.requestMs)
      .toBe(DEFAULT_MCP_REQUEST_TIMEOUT_MS);
    expect(createShellMcpPresetInput({ requestMs: 300_000 }).timeouts?.requestMs)
      .toBe(300_000);
  });

  it('keeps shell_exec and the persistent session tools out of the default allowlist', () => {
    // These are the opt-in, risk-bearing tools. They must NOT appear in the
    // safe-by-default allowlist — the default preset exposes only read/status
    // tools so a fresh install cannot execute commands until the user opts in.
    const preset = createShellMcpPresetInput();
    const allowlisted = new Set(preset.allowlist?.toolNames ?? []);
    const gatedTools = ['shell_exec', 'shell_batch', 'process_batch', 'python_exec', 'local_file_write', 'local_file_read', 'local_file_stat', 'shell_session_begin', 'shell_session_exec', 'shell_session_end'];
    for (const tool of gatedTools) {
      expect(allowlisted.has(tool as string)).toBe(false);
    }
  });

  it('registers the persistent session tools in the shell tool catalog', () => {
    // Sanity: contracts and the native host must agree on tool names. This guards
    // against silent drift when the allowlist or tool list changes.
    expect(SHELL_TOOL_NAMES).toContain('shell_session_begin');
    expect(SHELL_TOOL_NAMES).toContain('shell_session_exec');
    expect(SHELL_TOOL_NAMES).toContain('shell_session_end');
  });

  it('evaluates explicit Shell approvals without widening the allowlist', () => {
    const allowlist: McpToolAllowlist = {
      mode: 'allow',
      toolNames: ['shell_status', 'python_status'],
    };
    expect(isShellToolAllowedByAllowlist(allowlist, 'shell_status')).toBe(true);
    expect(isShellToolAllowedByAllowlist(allowlist, 'shell_exec')).toBe(false);
    expect(allowlist.toolNames).toEqual(['shell_status', 'python_status']);
  });

  it('supports deny lists without treating omitted tools as approved', () => {
    const allowlist: McpToolAllowlist = { mode: 'deny', toolNames: ['shell_exec'] };
    expect(isShellToolAllowedByAllowlist(allowlist, 'shell_status')).toBe(true);
    expect(isShellToolAllowedByAllowlist(allowlist, 'shell_exec')).toBe(false);
  });

  it('treats an explicit all policy as approved without mutating it', () => {
    const allowlist: McpToolAllowlist = { mode: 'all', toolNames: [] };
    expect(isShellToolAllowedByAllowlist(allowlist, 'shell_exec')).toBe(true);
    expect(allowlist).toEqual({ mode: 'all', toolNames: [] });
  });

  it('detects the built-in Shell Local server by name or native host', () => {
    expect(isShellMcpServer({
      displayName: 'Shell Local',
      transport: { kind: 'native_messaging', nativeHost: 'other.host' },
    })).toBe(true);
    expect(isShellMcpServer({
      displayName: 'Anything',
      transport: { kind: 'native_messaging', nativeHost: 'com.deepseek_pp.shell' },
    })).toBe(true);
    expect(isShellMcpServer({
      displayName: 'Anything',
      transport: { kind: 'native_messaging', nativeHost: 'com.example.other' },
    })).toBe(false);
  });

  it('sets maxToolCount to at least 64 so all 12+ native shell tools can be discovered', () => {
    const preset = createShellMcpPresetInput();
    expect(preset.limits?.maxToolCount).toBeGreaterThanOrEqual(64);
  });

  it('upgrades legacy Shell servers with small maxToolCount to 128', () => {
    expect(buildShellLimitsUpgrade({ maxResultBytes: 128_000, maxToolCount: 8 })).toEqual({
      maxResultBytes: 128_000,
      maxToolCount: 128,
    });
    expect(buildShellLimitsUpgrade({ maxResultBytes: 128_000, maxToolCount: 128 })).toBeNull();
  });
});
