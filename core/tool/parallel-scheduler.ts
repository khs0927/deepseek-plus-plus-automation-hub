import type { ToolCall, ToolDescriptor } from './types';

export const DEFAULT_PARALLEL_TOOL_CONCURRENCY = 4;
export const MAX_PARALLEL_TOOL_CONCURRENCY = 8;

export interface ToolExecutionBatch {
  mode: 'parallel' | 'serial';
  callIndexes: number[];
}

export interface ParallelToolExecutionPlan {
  batches: ToolExecutionBatch[];
  parallelCallCount: number;
  serialCallCount: number;
  maxConcurrency: number;
}

export interface ExecutePlannedToolCallsOptions<T> {
  calls: readonly ToolCall[];
  descriptors: readonly ToolDescriptor[];
  execute(call: ToolCall, index: number): Promise<T>;
  maxConcurrency?: number;
}

const READ_PREFIXES = [
  'get',
  'list',
  'read',
  'search',
  'fetch',
  'find',
  'query',
  'lookup',
  'inspect',
  'describe',
  'status',
  'check',
] as const;

const MUTATION_TOKENS = [
  'create',
  'update',
  'delete',
  'remove',
  'write',
  'edit',
  'set',
  'add',
  'move',
  'rename',
  'send',
  'publish',
  'deploy',
  'execute',
  'run',
  'spawn',
  'kill',
  'cancel',
  'approve',
  'merge',
  'close',
  'archive',
] as const;

export function planToolCallExecution(
  calls: readonly ToolCall[],
  descriptors: readonly ToolDescriptor[],
  maxConcurrency = DEFAULT_PARALLEL_TOOL_CONCURRENCY,
): ParallelToolExecutionPlan {
  const normalizedConcurrency = normalizeConcurrency(maxConcurrency);
  const descriptorMap = buildDescriptorLookup(descriptors);
  const batches: ToolExecutionBatch[] = [];
  let pendingParallel: number[] = [];
  let parallelCallCount = 0;
  let serialCallCount = 0;

  const flushParallel = (): void => {
    if (pendingParallel.length === 0) return;
    for (let index = 0; index < pendingParallel.length; index += normalizedConcurrency) {
      const chunk = pendingParallel.slice(index, index + normalizedConcurrency);
      batches.push({
        mode: chunk.length > 1 ? 'parallel' : 'serial',
        callIndexes: chunk,
      });
      if (chunk.length > 1) parallelCallCount += chunk.length;
      else serialCallCount += 1;
    }
    pendingParallel = [];
  };

  calls.forEach((call, index) => {
    const descriptor = resolveDescriptor(call, descriptorMap);
    if (descriptor && isParallelSafeMcpDescriptor(descriptor)) {
      pendingParallel.push(index);
      return;
    }

    flushParallel();
    batches.push({ mode: 'serial', callIndexes: [index] });
    serialCallCount += 1;
  });

  flushParallel();

  return {
    batches,
    parallelCallCount,
    serialCallCount,
    maxConcurrency: normalizedConcurrency,
  };
}

export async function executeToolCallsWithPlan<T>(
  options: ExecutePlannedToolCallsOptions<T>,
): Promise<T[]> {
  const plan = planToolCallExecution(
    options.calls,
    options.descriptors,
    options.maxConcurrency,
  );
  const results = new Array<T>(options.calls.length);

  for (const batch of plan.batches) {
    if (batch.mode === 'parallel') {
      const entries = await Promise.all(
        batch.callIndexes.map(async (index) => ({
          index,
          value: await options.execute(options.calls[index]!, index),
        })),
      );
      for (const entry of entries) results[entry.index] = entry.value;
      continue;
    }

    for (const index of batch.callIndexes) {
      results[index] = await options.execute(options.calls[index]!, index);
    }
  }

  return results;
}

export function isParallelSafeMcpDescriptor(descriptor: ToolDescriptor): boolean {
  if (descriptor.provider.kind !== 'mcp') return false;
  if (!descriptor.execution.enabled) return false;
  if (descriptor.execution.risk !== 'low') return false;

  const annotations = descriptor.annotations ?? {};
  if (readBooleanAnnotation(annotations, ['destructiveHint', 'destructive', 'isDestructive']) === true) {
    return false;
  }
  if (readBooleanAnnotation(annotations, ['readOnlyHint', 'readOnly', 'readonly']) === true) {
    return true;
  }

  const name = normalizeToolName(descriptor.name || descriptor.invocationName);
  if (!name) return false;
  if (MUTATION_TOKENS.some((token) => hasToken(name, token))) return false;
  return READ_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}_`));
}

function buildDescriptorLookup(
  descriptors: readonly ToolDescriptor[],
): Map<string, ToolDescriptor> {
  const lookup = new Map<string, ToolDescriptor>();
  for (const descriptor of descriptors) {
    lookup.set(`id:${descriptor.id}`, descriptor);
    lookup.set(`invocation:${descriptor.invocationName}`, descriptor);
    lookup.set(`provider:${descriptor.provider.id}:name:${descriptor.name}`, descriptor);
  }
  return lookup;
}

function resolveDescriptor(
  call: ToolCall,
  lookup: ReadonlyMap<string, ToolDescriptor>,
): ToolDescriptor | null {
  if (call.descriptorId) {
    const byId = lookup.get(`id:${call.descriptorId}`);
    if (byId) return byId;
  }
  if (call.invocationName) {
    const byInvocation = lookup.get(`invocation:${call.invocationName}`);
    if (byInvocation) return byInvocation;
  }
  if (call.provider?.id) {
    return lookup.get(`provider:${call.provider.id}:name:${call.name}`) ?? null;
  }
  return null;
}

function readBooleanAnnotation(
  annotations: Readonly<Record<string, string>>,
  keys: readonly string[],
): boolean | null {
  for (const key of keys) {
    const raw = annotations[key];
    if (raw === undefined) continue;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'boolean') return parsed;
    } catch {
      // Ignore non-JSON annotation values.
    }
  }
  return null;
}

function normalizeToolName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hasToken(value: string, token: string): boolean {
  return value.split('_').includes(token);
}

function normalizeConcurrency(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PARALLEL_TOOL_CONCURRENCY;
  return Math.max(
    1,
    Math.min(MAX_PARALLEL_TOOL_CONCURRENCY, Math.floor(value)),
  );
}
