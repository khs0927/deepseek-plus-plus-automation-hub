import type { SupportedLocale } from '../i18n/background';
import type {
  RuntimeToolAuthorizationContext,
  ToolCall,
  ToolDescriptor,
  ToolExecutionTrigger,
  ToolResult,
} from './types';
import type {
  RuntimeToolCallOptions,
  RuntimeToolRuntime,
} from './runtime';

export const DEFAULT_MCP_BATCH_MAX_CONCURRENCY = 4;
export const MAX_MCP_BATCH_MAX_CONCURRENCY = 16;
export const MAX_MCP_BATCH_CALLS = 128;

export interface RuntimeToolBatchError {
  name: string;
  message: string;
}

export type RuntimeToolBatchItemOutcome =
  | {
      callId: string;
      status: 'fulfilled';
      result: ToolResult;
    }
  | {
      callId: string;
      status: 'rejected';
      error: RuntimeToolBatchError;
    };

export interface RuntimeToolBatchWave {
  kind: 'parallel_read' | 'serial';
  callIds: string[];
  providerIds: string[];
}

export interface RuntimeToolBatchPlan {
  waves: RuntimeToolBatchWave[];
  maxConcurrency: number;
  totalCalls: number;
}

export interface ExecuteRuntimeToolBatchInput {
  runtime: RuntimeToolRuntime;
  calls: readonly ToolCall[];
  authorization: RuntimeToolAuthorizationContext | ToolExecutionTrigger;
  locale?: SupportedLocale;
  maxConcurrency?: number;
  options?: Omit<RuntimeToolCallOptions, 'idempotencyKey'>;
}

interface PlannedCall {
  call: ToolCall;
  descriptor: ToolDescriptor | null;
  parallelRead: boolean;
  providerId: string | null;
}

interface InternalBatchWave {
  kind: RuntimeToolBatchWave['kind'];
  calls: PlannedCall[];
}

/**
 * Builds a conservative execution plan for already-prepared tool calls.
 *
 * Only explicit, non-destructive MCP read operations are eligible for
 * parallel execution. Calls from the same MCP provider never share one
 * parallel wave. Unknown, local, write, execute, or destructive calls become
 * serial barriers. The central runtime still authorizes every call
 * independently at execution time.
 */
export async function planBoundedMcpBatch(
  runtime: RuntimeToolRuntime,
  calls: readonly ToolCall[],
  locale?: SupportedLocale,
  maxConcurrency: number = DEFAULT_MCP_BATCH_MAX_CONCURRENCY,
): Promise<RuntimeToolBatchPlan> {
  const validated = validateBatchCalls(calls, maxConcurrency);
  const descriptors = await runtime.getToolDescriptors(locale);
  const internal = buildWaves(validated, descriptors, maxConcurrency);
  return {
    waves: internal.map((wave) => ({
      kind: wave.kind,
      callIds: wave.calls.map(({ call }) => call.id!),
      providerIds: wave.calls
        .map(({ providerId }) => providerId)
        .filter((value): value is string => value !== null),
    })),
    maxConcurrency,
    totalCalls: calls.length,
  };
}

/**
 * Executes a bounded MCP fan-out without introducing a second authorization
 * or provider-dispatch path. Every call is routed through
 * RuntimeToolRuntime.executeToolCall(), so capability grants, one-time call
 * reservations, descriptor snapshots, payload rehydration, history, and
 * provider policy remain authoritative.
 */
export async function executeBoundedMcpBatch(
  input: ExecuteRuntimeToolBatchInput,
): Promise<RuntimeToolBatchItemOutcome[]> {
  const maxConcurrency = input.maxConcurrency ?? DEFAULT_MCP_BATCH_MAX_CONCURRENCY;
  const calls = validateBatchCalls(input.calls, maxConcurrency);
  const descriptors = await input.runtime.getToolDescriptors(input.locale);
  const waves = buildWaves(calls, descriptors, maxConcurrency);
  const outcomes: RuntimeToolBatchItemOutcome[] = [];

  for (const wave of waves) {
    input.options?.assertActive?.();
    if (input.options?.signal?.aborted) {
      throw abortReason(input.options.signal);
    }

    if (wave.kind === 'serial') {
      const planned = wave.calls[0]!;
      outcomes.push(await executeOne(input, planned.call));
      continue;
    }

    const settled = await Promise.all(
      wave.calls.map(({ call }) => executeOne(input, call)),
    );
    outcomes.push(...settled);
  }

  return outcomes;
}

function buildWaves(
  calls: readonly ToolCall[],
  descriptors: readonly ToolDescriptor[],
  maxConcurrency: number,
): InternalBatchWave[] {
  const descriptorsById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const waves: InternalBatchWave[] = [];
  let currentReads: PlannedCall[] = [];
  const currentProviders = new Set<string>();

  const flushReads = () => {
    if (currentReads.length === 0) return;
    waves.push({ kind: 'parallel_read', calls: currentReads });
    currentReads = [];
    currentProviders.clear();
  };

  for (const call of calls) {
    const descriptor = call.descriptorId
      ? descriptorsById.get(call.descriptorId) ?? null
      : null;
    const parallelRead = descriptor ? isParallelSafeMcpRead(descriptor) : false;
    const providerId = descriptor?.provider.kind === 'mcp'
      ? descriptor.provider.id
      : null;
    const planned: PlannedCall = { call, descriptor, parallelRead, providerId };

    if (!parallelRead || !providerId) {
      flushReads();
      waves.push({ kind: 'serial', calls: [planned] });
      continue;
    }

    if (currentReads.length >= maxConcurrency || currentProviders.has(providerId)) {
      flushReads();
    }
    currentReads.push(planned);
    currentProviders.add(providerId);
  }

  flushReads();
  return waves;
}

export function isParallelSafeMcpRead(descriptor: ToolDescriptor): boolean {
  if (descriptor.provider.kind !== 'mcp') return false;
  if (!descriptor.execution.enabled || descriptor.execution.mode === 'disabled') return false;

  const annotations = descriptor.annotations ?? {};
  if (annotationIsTrue(annotations.destructiveHint)) return false;

  const operation = annotations.operation?.trim().toLowerCase();
  const explicitRead = operation === 'read';
  const mcpReadOnly = annotationIsTrue(annotations.readOnlyHint);
  return explicitRead || mcpReadOnly;
}

function validateBatchCalls(
  calls: readonly ToolCall[],
  maxConcurrency: number,
): readonly ToolCall[] {
  if (!Number.isInteger(maxConcurrency)
    || maxConcurrency < 1
    || maxConcurrency > MAX_MCP_BATCH_MAX_CONCURRENCY) {
    throw new RangeError(
      `MCP batch maxConcurrency must be an integer between 1 and ${MAX_MCP_BATCH_MAX_CONCURRENCY}.`,
    );
  }
  if (calls.length > MAX_MCP_BATCH_CALLS) {
    throw new RangeError(`MCP batch cannot exceed ${MAX_MCP_BATCH_CALLS} calls.`);
  }

  const ids = new Set<string>();
  for (const call of calls) {
    const id = typeof call.id === 'string' ? call.id.trim() : '';
    if (!id) throw new Error('Every MCP batch call must have a stable call id.');
    if (ids.has(id)) throw new Error(`Duplicate MCP batch call id: ${id}.`);
    ids.add(id);
  }
  return calls;
}

async function executeOne(
  input: ExecuteRuntimeToolBatchInput,
  call: ToolCall,
): Promise<RuntimeToolBatchItemOutcome> {
  try {
    const result = await input.runtime.executeToolCall(
      call,
      input.authorization,
      input.locale,
      input.options,
    );
    return {
      callId: call.id!,
      status: 'fulfilled',
      result,
    };
  } catch (error) {
    return {
      callId: call.id!,
      status: 'rejected',
      error: normalizeBatchError(error),
    };
  }
}

function annotationIsTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function normalizeBatchError(error: unknown): RuntimeToolBatchError {
  const name = error instanceof Error && error.name ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: name.slice(0, 120),
    message: message.slice(0, 1_000),
  };
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('Tool batch execution was aborted.', 'AbortError');
}
