import type { ToolDescriptor } from '../tool/types';
import {
  getMcpCapabilityServerSettings,
} from './capability-settings';
import type {
  McpCapabilityProjection,
  McpCapabilitySettings,
} from './capability-types';
import {
  getMcpCapabilityOperation,
  isMcpCapabilityDescriptor,
  MCP_CAPABILITY_OPERATIONS,
  type McpCapabilityOperation,
} from './capability-contract';

// The prompt renderer emits the JSON Schema and a generated example payload.
// Reserve a second schema-sized block plus its fixed XML/instruction framing so
// the adaptive budget remains an upper bound instead of a rough average.
const PROMPT_DESCRIPTOR_FIXED_OVERHEAD_BYTES = 1_024;

export interface McpCapabilityProjectionInput {
  descriptors: readonly ToolDescriptor[];
  settings: McpCapabilitySettings;
  intent: string;
  /**
   * Optional semantic ordering supplied by an external decision layer.
   * This never changes eligibility, authorization or prompt budgets.
   */
  adaptiveCandidateOrder?: readonly string[];
}

/**
 * Produces the model-facing MCP projection. It never creates, alters or
 * re-authorizes a real descriptor; execution always resolves against the full
 * current runtime descriptor set later.
 */
export function projectMcpCapabilityDescriptors(
  input: McpCapabilityProjectionInput,
): McpCapabilityProjection {
  const helpers = input.descriptors.filter(isMcpCapabilityDescriptor);
  const eligibleMcp = input.descriptors.filter(isExecutableMcpDescriptor);
  const serverModes = new Map(eligibleMcp.map((descriptor) => [
    descriptor.id,
    getMcpCapabilityServerSettings(input.settings, descriptor.provider.id),
  ]));
  const adaptive = eligibleMcp.filter((descriptor) => serverModes.get(descriptor.id)?.mode === 'adaptive');
  const onDemand = eligibleMcp.filter((descriptor) => serverModes.get(descriptor.id)?.mode === 'on_demand');
  const direct = eligibleMcp.filter((descriptor) => serverModes.get(descriptor.id)?.mode === 'direct');
  const pinned = new Set(
    adaptive.flatMap((descriptor) => serverModes.get(descriptor.id)?.pinnedDescriptorIds ?? []),
  );
  const selectedAdaptive = selectAdaptiveDescriptors(
    adaptive,
    input.intent,
    pinned,
    input.settings.adaptiveMaxDirectTools,
    input.settings.adaptiveMaxPromptBytes,
    input.adaptiveCandidateOrder,
  );
  const selectedIds = new Set([...direct, ...selectedAdaptive].map((descriptor) => descriptor.id));
  const hidden = [...onDemand, ...adaptive.filter((descriptor) => !selectedIds.has(descriptor.id))];

  if (hidden.length === 0) {
    // Default settings are direct. Preserve the released descriptor order and
    // exclude the internal catalog controls so legacy prompt bytes stay stable.
    return {
      descriptors: input.descriptors.filter((descriptor) => !isMcpCapabilityDescriptor(descriptor)),
      directDescriptorIds: eligibleMcp.map((descriptor) => descriptor.id),
      hiddenDescriptorIds: [],
      usesCatalog: false,
    };
  }

  assertCompleteCapabilityHelperSet(helpers);
  const descriptors = [
    ...input.descriptors.filter((descriptor) => (
      !isMcpCapabilityDescriptor(descriptor) &&
      (!isMcpDescriptor(descriptor) || !isExecutableMcpDescriptor(descriptor) || selectedIds.has(descriptor.id))
    )),
    ...helpers,
  ];
  return {
    descriptors,
    directDescriptorIds: [...selectedIds],
    hiddenDescriptorIds: hidden.map((descriptor) => descriptor.id),
    usesCatalog: true,
  };
}

export function rankMcpCapabilityDescriptors(
  descriptors: readonly ToolDescriptor[],
  query: string,
  pinnedDescriptorIds: ReadonlySet<string> = new Set(),
): ToolDescriptor[] {
  const normalizedQuery = normalizeSearchText(query);
  const queryTerms = tokenize(normalizedQuery);
  return descriptors
    .map((descriptor, index) => ({
      descriptor,
      index,
      score: scoreDescriptor(descriptor, normalizedQuery, queryTerms, pinnedDescriptorIds.has(descriptor.id)),
    }))
    .sort((left, right) => (
      right.score - left.score ||
      compareLexical(
        normalizeSearchText(left.descriptor.title),
        normalizeSearchText(right.descriptor.title),
      ) ||
      compareLexical(
        normalizeSearchText(left.descriptor.name),
        normalizeSearchText(right.descriptor.name),
      ) ||
      left.index - right.index
    ))
    .map((entry) => entry.descriptor);
}

export function estimateMcpCapabilityPromptBytes(descriptor: ToolDescriptor): number {
  const descriptorText = [
    descriptor.invocationName,
    descriptor.title,
    descriptor.description,
  ].join('\n');
  const encoder = new TextEncoder();
  const schemaBytes = encoder.encode(JSON.stringify(descriptor.inputSchema)).byteLength;
  return encoder.encode(descriptorText).byteLength +
    schemaBytes * 2 +
    PROMPT_DESCRIPTOR_FIXED_OVERHEAD_BYTES;
}

export function isMcpDescriptor(descriptor: ToolDescriptor): boolean {
  return descriptor.provider.kind === 'mcp';
}

export function isExecutableMcpDescriptor(descriptor: ToolDescriptor): boolean {
  return isMcpDescriptor(descriptor) && descriptor.execution.enabled && descriptor.execution.mode !== 'disabled';
}

function selectAdaptiveDescriptors(
  descriptors: readonly ToolDescriptor[],
  intent: string,
  pinnedDescriptorIds: ReadonlySet<string>,
  maxTools: number,
  maxBytes: number,
  adaptiveCandidateOrder?: readonly string[],
): ToolDescriptor[] {
  const selected: ToolDescriptor[] = [];
  let consumedBytes = 0;
  const lexical = rankMcpCapabilityDescriptors(descriptors, intent, pinnedDescriptorIds);
  const ranked = applyAdaptiveCandidateOrder(lexical, adaptiveCandidateOrder, pinnedDescriptorIds);
  for (const descriptor of ranked) {
    const bytes = estimateMcpCapabilityPromptBytes(descriptor);
    if (selected.length >= maxTools || consumedBytes + bytes > maxBytes) continue;
    selected.push(descriptor);
    consumedBytes += bytes;
  }
  return selected;
}

function applyAdaptiveCandidateOrder(
  lexical: readonly ToolDescriptor[],
  adaptiveCandidateOrder: readonly string[] | undefined,
  pinnedDescriptorIds: ReadonlySet<string>,
): ToolDescriptor[] {
  if (!adaptiveCandidateOrder?.length) return [...lexical];

  const byId = new Map(lexical.map((descriptor) => [descriptor.id, descriptor]));
  const emitted = new Set<string>();
  const ordered: ToolDescriptor[] = [];

  // Explicit pins remain deterministic policy and cannot be demoted by a
  // probabilistic decision provider.
  for (const descriptor of lexical) {
    if (!pinnedDescriptorIds.has(descriptor.id)) continue;
    ordered.push(descriptor);
    emitted.add(descriptor.id);
  }

  for (const descriptorId of adaptiveCandidateOrder) {
    const descriptor = byId.get(descriptorId);
    if (!descriptor || emitted.has(descriptor.id)) continue;
    ordered.push(descriptor);
    emitted.add(descriptor.id);
  }

  // A decision provider may only rank a bounded shortlist. Preserve the
  // released lexical order for every remaining eligible descriptor.
  for (const descriptor of lexical) {
    if (emitted.has(descriptor.id)) continue;
    ordered.push(descriptor);
  }

  return ordered;
}

function scoreDescriptor(
  descriptor: ToolDescriptor,
  normalizedQuery: string,
  queryTerms: readonly string[],
  pinned: boolean,
): number {
  const name = normalizeSearchText(`${descriptor.name} ${descriptor.invocationName}`);
  const title = normalizeSearchText(descriptor.title);
  const description = normalizeSearchText(descriptor.description);
  let score = pinned ? 10_000 : 0;
  if (normalizedQuery) {
    if (name.includes(normalizedQuery)) score += 1_000;
    if (title.includes(normalizedQuery)) score += 700;
    if (description.includes(normalizedQuery)) score += 250;
  }
  for (const term of queryTerms) {
    if (name.includes(term)) score += 120;
    if (title.includes(term)) score += 80;
    if (description.includes(term)) score += 25;
  }
  return score;
}

function assertCompleteCapabilityHelperSet(helpers: readonly ToolDescriptor[]): void {
  const operations = new Set(
    helpers.map(getMcpCapabilityOperation).filter((value): value is McpCapabilityOperation => value !== null),
  );
  const missing = MCP_CAPABILITY_OPERATIONS.filter((operation) => !operations.has(operation));
  if (missing.length === 0) return;
  throw new Error(`MCP capability catalog is incomplete: missing ${missing.join(', ')}.`);
}

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim();
}

function compareLexical(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function tokenize(value: string): string[] {
  const matches = value.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(matches.filter((term) => term.length >= 2))];
}
