import type { ToolDescriptor } from '../tool/types';
import {
  evaluateDecision,
  getDecisionRuntimeConfig,
} from '../decision/provider';
import { decisionTraceBuffer } from '../decision/trace';
import {
  getMcpCapabilityServerSettings,
} from './capability-settings';
import type {
  McpCapabilityProjection,
  McpCapabilitySettings,
} from './capability-types';
import {
  isExecutableMcpDescriptor,
  projectMcpCapabilityDescriptors,
  rankMcpCapabilityDescriptors,
} from './capability-projection';

const JEV_CHOICE_MAX_OPTIONS = 255;
const RESERVED_ABSTAIN_OPTIONS = 1;
const MCP_DECISION_CANDIDATE_LIMIT = JEV_CHOICE_MAX_OPTIONS - RESERVED_ABSTAIN_OPTIONS;
const MCP_DECISION_CONFIDENCE_THRESHOLD = 0.75;
const MCP_DECISION_TEXT_LIMIT = 480;

export interface McpCapabilityDecisionProjectionInput {
  descriptors: readonly ToolDescriptor[];
  settings: McpCapabilitySettings;
  intent: string;
  signal?: AbortSignal;
}

/**
 * Decision-assisted MCP projection.
 *
 * The existing projection remains authoritative for eligibility and prompt
 * budgets. A decision provider can only suggest an order for already-eligible
 * adaptive descriptors. In shadow mode the suggestion is traced but never
 * applied. Any provider error, invalid result or low-confidence result falls
 * back to the released lexical behavior.
 */
export async function projectMcpCapabilityDescriptorsWithDecision(
  input: McpCapabilityDecisionProjectionInput,
): Promise<McpCapabilityProjection> {
  const runtime = getDecisionRuntimeConfig();
  const effectiveSettings = withActiveDecisionExposureDefaults(
    input.descriptors,
    input.settings,
    runtime.mode === 'active' && runtime.provider !== null && input.intent.trim().length > 0,
  );
  const baseline = projectMcpCapabilityDescriptors({
    descriptors: input.descriptors,
    settings: effectiveSettings,
    intent: input.intent,
  });

  if (runtime.mode === 'disabled' || !runtime.provider || !input.intent.trim()) {
    return baseline;
  }

  const adaptive = input.descriptors.filter((descriptor) => (
    isExecutableMcpDescriptor(descriptor) &&
    getMcpCapabilityServerSettings(effectiveSettings, descriptor.provider.id).mode === 'adaptive'
  ));

  if (adaptive.length < 2) return baseline;

  const pinned = new Set(
    adaptive.flatMap((descriptor) => (
      getMcpCapabilityServerSettings(effectiveSettings, descriptor.provider.id).pinnedDescriptorIds
    )),
  );
  const lexical = rankMcpCapabilityDescriptors(adaptive, input.intent, pinned);
  const candidates = lexical.slice(0, MCP_DECISION_CANDIDATE_LIMIT);
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const result = await evaluateDecision({
      requestId,
      purpose: 'mcp_rank',
      intent: sanitizeText(input.intent, 2_000),
      candidates: candidates.map(toDecisionCandidate),
      confidenceThreshold: MCP_DECISION_CONFIDENCE_THRESHOLD,
    }, input.signal);

    const selectedIds = result.selections.map((selection) => selection.candidateId);
    const fallbackReason = result.escalated
      ? result.escalationReason ?? 'invalid_result'
      : result.confidence < MCP_DECISION_CONFIDENCE_THRESHOLD
        ? 'low_confidence'
        : selectedIds.length === 0
          ? 'no_selection'
          : undefined;
    const applied = (
      runtime.mode === 'active' &&
      fallbackReason === undefined
    );

    decisionTraceBuffer.record({
      requestId,
      purpose: 'mcp_rank',
      mode: runtime.mode,
      provider: result.provider || runtime.provider.id,
      ...(result.model ? { model: result.model } : {}),
      candidateIds: candidates.map((candidate) => candidate.id),
      selectedIds,
      confidence: result.confidence,
      threshold: MCP_DECISION_CONFIDENCE_THRESHOLD,
      ...(fallbackReason ? { fallbackReason } : {}),
      latencyMs: Date.now() - startedAt,
      applied,
    });

    if (!applied) return baseline;

    return projectMcpCapabilityDescriptors({
      descriptors: input.descriptors,
      settings: effectiveSettings,
      intent: input.intent,
      adaptiveCandidateOrder: selectedIds,
    });
  } catch {
    decisionTraceBuffer.record({
      requestId,
      purpose: 'mcp_rank',
      mode: runtime.mode,
      provider: runtime.provider.id,
      candidateIds: candidates.map((candidate) => candidate.id),
      selectedIds: [],
      threshold: MCP_DECISION_CONFIDENCE_THRESHOLD,
      fallbackReason: 'provider_error',
      latencyMs: Date.now() - startedAt,
      applied: false,
    });
    return baseline;
  }
}

function withActiveDecisionExposureDefaults(
  descriptors: readonly ToolDescriptor[],
  settings: McpCapabilitySettings,
  enabled: boolean,
): McpCapabilitySettings {
  if (!enabled) return settings;

  const serverIds = new Set(
    descriptors
      .filter((descriptor) => (
        descriptor.provider.kind === 'mcp' &&
        descriptor.provider.displayName === 'Subagent Manager' &&
        !settings.servers[descriptor.provider.id]
      ))
      .map((descriptor) => descriptor.provider.id),
  );
  if (serverIds.size === 0) return settings;

  const servers = { ...settings.servers };
  for (const serverId of serverIds) {
    servers[serverId] = {
      mode: 'adaptive',
      pinnedDescriptorIds: [],
    };
  }
  return {
    ...settings,
    servers,
  };
}

function toDecisionCandidate(descriptor: ToolDescriptor) {
  return {
    id: descriptor.id,
    name: sanitizeText(descriptor.invocationName || descriptor.name, 160),
    title: sanitizeText(descriptor.title, 240),
    description: sanitizeText(descriptor.description, MCP_DECISION_TEXT_LIMIT),
    provider: sanitizeText(descriptor.provider.id, 160),
    risk: descriptor.execution.risk,
  } as const;
}

function sanitizeText(value: string, maxChars: number): string {
  return redactDecisionSecrets(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function redactDecisionSecrets(value: string): string {
  return value
    .replace(
      /\b(authorization|api[_ -]?key|access[_ -]?token|token|password|passwd|secret)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]{4,}/gi,
      '$1=[REDACTED]',
    )
    .replace(/\bbearer\s+[A-Za-z0-9._~+\/=:-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
      '[REDACTED_JWT]',
    );
}
