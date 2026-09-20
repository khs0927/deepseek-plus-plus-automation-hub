import type { ToolCall, ToolDescriptor } from '../tool/types';
import { getParallelSafeMcpCalls } from '../tool/parallel-scheduler';
import { evaluateDecision, getDecisionRuntimeConfig } from './provider';
import { sanitizeDecisionText } from './sanitize';
import { decisionTraceBuffer } from './trace';

const MCP_FANOUT_CONFIDENCE_THRESHOLD = 0.75;
const MCP_FANOUT_MAX_CANDIDATES = 64;

export interface McpFanoutSelectionInput {
  calls: readonly ToolCall[];
  descriptors: readonly ToolDescriptor[];
  signal?: AbortSignal;
}

export async function selectParallelMcpCallIndexes(
  input: McpFanoutSelectionInput,
): Promise<ReadonlySet<number>> {
  const safe = getParallelSafeMcpCalls(input.calls, input.descriptors)
    .slice(0, MCP_FANOUT_MAX_CANDIDATES);
  const baseline = new Set(safe.map((entry) => entry.index));
  if (safe.length < 2) return baseline;

  const runtime = getDecisionRuntimeConfig();
  if (runtime.mode === 'disabled' || !runtime.provider) return baseline;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const candidateIdToIndex = new Map<string, number>();
  const candidates = safe.map((entry) => {
    const id = `call:${entry.index}:${entry.descriptor.id}`;
    candidateIdToIndex.set(id, entry.index);
    return {
      id,
      name: sanitizeDecisionText(
        entry.descriptor.invocationName || entry.descriptor.name,
        160,
      ),
      title: sanitizeDecisionText(entry.descriptor.title, 240),
      description: sanitizeDecisionText(
        [
          entry.descriptor.description,
          `Arguments: ${safeStringify(entry.call.payload)}`,
        ].join(' '),
        900,
      ),
      provider: sanitizeDecisionText(entry.descriptor.provider.id, 160),
      risk: entry.descriptor.execution.risk,
    } as const;
  });

  try {
    const result = await evaluateDecision({
      requestId,
      purpose: 'mcp_fanout',
      intent: 'Select which deterministic-safe, model-requested MCP calls are semantically relevant and independent enough to execute in the same parallel batch.',
      candidates,
      confidenceThreshold: MCP_FANOUT_CONFIDENCE_THRESHOLD,
    }, input.signal);

    const selectedIndexes = new Set<number>();
    for (const selection of result.selections) {
      const index = candidateIdToIndex.get(selection.candidateId);
      if (index !== undefined) selectedIndexes.add(index);
    }

    const providerAccepted = (
      result.escalated !== true &&
      result.selections.length >= 2 &&
      result.confidence >= MCP_FANOUT_CONFIDENCE_THRESHOLD
    );
    const applied = runtime.mode === 'active' && providerAccepted;

    decisionTraceBuffer.record({
      requestId,
      purpose: 'mcp_fanout',
      mode: runtime.mode,
      provider: result.provider || runtime.provider.id,
      ...(result.model ? { model: result.model } : {}),
      candidateIds: candidates.map((candidate) => candidate.id),
      selectedIds: result.selections.map((selection) => selection.candidateId),
      confidence: result.confidence,
      threshold: MCP_FANOUT_CONFIDENCE_THRESHOLD,
      ...(!providerAccepted
        ? {
          fallbackReason: result.escalationReason ?? (
            result.selections.length < 2
              ? 'no_selection'
              : 'low_confidence'
          ),
        }
        : {}),
      latencyMs: Date.now() - startedAt,
      applied,
    });

    if (runtime.mode === 'shadow') return baseline;
    if (!applied) return new Set<number>();
    return selectedIndexes;
  } catch {
    decisionTraceBuffer.record({
      requestId,
      purpose: 'mcp_fanout',
      mode: runtime.mode,
      provider: runtime.provider.id,
      candidateIds: candidates.map((candidate) => candidate.id),
      selectedIds: [],
      threshold: MCP_FANOUT_CONFIDENCE_THRESHOLD,
      fallbackReason: 'provider_error',
      latencyMs: Date.now() - startedAt,
      applied: false,
    });

    return runtime.mode === 'active'
      ? new Set<number>()
      : baseline;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[unserializable arguments]';
  }
}
