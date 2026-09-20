import {
  getProjectContextRecord,
  listProjectContextRuns,
  proposeProjectContext,
  searchProjectContext,
} from './store';
import type { JsonValue, ToolCall, ToolDescriptor, ToolProviderIdentity, ToolResult } from '../tool/types';
import type { ToolProviderExecutionContext } from '../tool/provider-registry';

export const PROJECT_CONTEXT_TOOL_PROVIDER: ToolProviderIdentity = {
  kind: 'local',
  id: 'project_context',
  displayName: 'Project Context',
  transport: 'in_process',
};

const provider = PROJECT_CONTEXT_TOOL_PROVIDER;

export const PROJECT_CONTEXT_TOOL_DESCRIPTORS: readonly ToolDescriptor[] = [
  descriptor('project_context_search', 'Search project conversation memory', {
    query: { type: 'string', description: 'Terms, error codes, symbols, or decisions to find.' },
  }, ['query'], 'low'),
  descriptor('project_context_get', 'Read one project memory record with provenance', {
    record_id: { type: 'string' },
  }, ['record_id'], 'low'),
  descriptor('project_context_propose', 'Propose a candidate project memory record', {
    content: { type: 'string' },
    kind: { type: 'string', enum: ['session_summary', 'decision', 'verified_result', 'failure', 'handoff', 'conflict'] },
  }, ['content', 'kind'], 'low'),
  descriptor('project_context_resolve', 'Resolve a project memory record (user approval required)', {
    record_id: { type: 'string' },
    status: { type: 'string', enum: ['confirmed', 'disputed', 'superseded', 'retracted'] },
  }, ['record_id', 'status'], 'high', 'disabled'),
  descriptor('project_runs_list', 'List project execution and context runs', {}, [], 'low'),
];

export async function executeProjectContextToolCall(
  call: ToolCall,
  context: ToolProviderExecutionContext,
): Promise<ToolResult> {
  const conversationId = context.capabilityScope?.chatSessionId;
  if (!conversationId) return failure(call, 'project_context_scope_missing', 'Project context tools require a background-owned conversation scope.', false);
  const projectId = await projectIdForConversation(conversationId);
  if (!projectId) return failure(call, 'project_context_not_in_project', 'The current conversation is not assigned to a project.', false);
  try {
    if (call.name === 'project_context_search') {
      const result = await searchProjectContext({ projectId, conversationId, query: stringValue(call.payload.query) ?? '', budgetTokens: 2_000, limit: 20 });
      return success(call, { projectId, records: result.records, usedTokens: result.usedTokens, truncated: result.truncated });
    }
    if (call.name === 'project_context_get') {
      const record = await getProjectContextRecord(stringValue(call.payload.record_id) ?? '', { projectId, conversationId });
      return success(call, record);
    }
    if (call.name === 'project_context_propose') {
      const content = stringValue(call.payload.content);
      const kind = stringValue(call.payload.kind);
      if (!content || !kind) return failure(call, 'project_context_invalid_proposal', 'A proposal requires content and kind.', false);
      const result = await proposeProjectContext({
        projectId,
        conversationId,
        messageId: `tool:${call.id ?? crypto.randomUUID()}`,
        branchId: conversationId,
        role: 'assistant',
        content,
        kind: kind as never,
      });
      return success(call, { id: result.record.id, status: result.record.status, deduplicated: result.deduplicated });
    }
    if (call.name === 'project_context_resolve') {
      return failure(call, 'project_context_confirmation_required', 'Resolving project memory requires explicit user approval in the project UI.', false);
    }
    if (call.name === 'project_runs_list') {
      return success(call, await listProjectContextRuns({ projectId, conversationId, limit: 100 }));
    }
    return failure(call, 'project_context_unknown_tool', `Unknown project context tool: ${call.name}`, false);
  } catch (error) {
    return failure(call, 'project_context_failed', error instanceof Error ? error.message : String(error), true);
  }
}

async function projectIdForConversation(conversationId: string): Promise<string | null> {
  const { getProjectForConversation } = await import('../project/store');
  return (await getProjectForConversation(conversationId))?.id ?? null;
}

function descriptor(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  risk: 'low' | 'high',
  mode: 'auto' | 'disabled' = 'auto',
): ToolDescriptor {
  return {
    id: `local:project_context:${name}`,
    provider,
    name,
    invocationName: name,
    title: description,
    description,
    inputSchema: { type: 'object', properties: properties as Record<string, JsonValue>, required, additionalProperties: false },
    execution: { mode, enabled: mode === 'auto', risk },
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function success(call: ToolCall, output: unknown): ToolResult {
  return { ok: true, name: call.name, callId: call.id, provider, summary: 'Project context operation completed.', output: output as never };
}

function failure(call: ToolCall, code: string, message: string, retryable: boolean): ToolResult {
  return { ok: false, name: call.name, callId: call.id, provider, summary: message, error: { code, message, retryable } };
}
