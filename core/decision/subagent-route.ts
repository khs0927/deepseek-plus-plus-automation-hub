import type {
  RuntimePreAuthorizationTransformer,
  RuntimePreAuthorizationTransformInput,
} from '../tool/runtime';
import type { ToolCall, ToolDescriptor } from '../tool/types';
import { evaluateDecision, getDecisionRuntimeConfig } from './provider';
import { sanitizeDecisionText } from './sanitize';
import { decisionTraceBuffer } from './trace';

const SUBAGENT_HEALTH_URL = 'http://127.0.0.1:8932/health';
const AGENT_ROUTE_CONFIDENCE_THRESHOLD = 0.80;
const MAX_BATCH_AGENT_ROUTE_TASKS = 8;

type SubagentEngine = 'deepseek_web' | 'gemini' | 'groq';

interface EngineAvailability {
  deepseek_web: boolean;
  gemini: boolean;
  groq: boolean;
}

const ENGINE_DESCRIPTIONS: Record<SubagentEngine, string> = {
  deepseek_web: 'Browser-backed DeepSeek worker using the locally logged-in DeepSeek web session.',
  gemini: 'Google Gemini API worker. Available only when the local Subagent Manager reports a configured Gemini key.',
  groq: 'Groq API worker optimized for low-latency inference. Available only when the local Subagent Manager reports a configured Groq key.',
};

export const decisionSubagentCallTransformer: RuntimePreAuthorizationTransformer = {
  transform(input) {
    return routeSubagentCall(input);
  },
};

export async function routeSubagentCall(
  input: RuntimePreAuthorizationTransformInput,
): Promise<ToolCall> {
  const descriptor = resolveSubagentDescriptor(
    input.call,
    input.currentDescriptors,
  );
  if (!descriptor) return input.call;
  return routeSubagentCallInternal(input, descriptor);
}

async function routeSubagentCallInternal(
  input: RuntimePreAuthorizationTransformInput,
  descriptor: ToolDescriptor,
): Promise<ToolCall> {
  const runtime = getDecisionRuntimeConfig();
  if (runtime.mode === 'disabled' || !runtime.provider) return input.call;

  const toolName = subagentToolName(descriptor);
  if (toolName !== 'invoke_subagent' && toolName !== 'invoke_subagent_batch') {
    return input.call;
  }

  const payload = isPlainRecord(input.call.payload)
    ? input.call.payload
    : null;
  if (!payload) return input.call;

  if (toolName === 'invoke_subagent') {
    const requested = readEngine(payload.engine);
    if (requested !== 'auto') return input.call;
    const availability = await readEngineAvailability(input.signal);
    const engines = availableEngines(availability);
    if (engines.length < 2) return input.call;
    const routed = await routeOneTaskEngine({
      role: stringValue(payload.role) || 'General Assistant',
      task: stringValue(payload.task),
      engines,
      signal: input.signal,
    });
    if (!routed) return input.call;
    return {
      ...input.call,
      payload: { ...payload, engine: routed },
    };
  }

  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  if (tasks.length === 0 || tasks.length > MAX_BATCH_AGENT_ROUTE_TASKS) {
    return input.call;
  }
  const hasAutoTask = tasks.some((entry) => (
    isPlainRecord(entry) && readEngine(entry.engine) === 'auto'
  ));
  if (!hasAutoTask) return input.call;

  const availability = await readEngineAvailability(input.signal);
  const engines = availableEngines(availability);
  if (engines.length < 2) return input.call;

  let changed = false;
  const routedTasks = await Promise.all(tasks.map(async (entry) => {
    if (!isPlainRecord(entry)) return entry;
    const requested = readEngine(entry.engine);
    if (requested !== 'auto') return entry;
    const routed = await routeOneTaskEngine({
      role: stringValue(entry.role) || 'General Assistant',
      task: stringValue(entry.task),
      engines,
      signal: input.signal,
    });
    if (!routed) return entry;
    changed = true;
    return { ...entry, engine: routed };
  }));

  if (!changed) return input.call;
  return {
    ...input.call,
    payload: { ...payload, tasks: routedTasks },
  };
}

async function routeOneTaskEngine(input: {
  role: string;
  task: string;
  engines: readonly SubagentEngine[];
  signal?: AbortSignal;
}): Promise<SubagentEngine | null> {
  if (!input.task.trim()) return null;
  const runtime = getDecisionRuntimeConfig();
  if (!runtime.provider || runtime.mode === 'disabled') return null;

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const candidates = input.engines.map((engine) => ({
    id: engine,
    name: engine,
    title: engine,
    description: ENGINE_DESCRIPTIONS[engine],
    provider: 'subagent-engine',
    risk: 'low',
  } as const));

  try {
    const result = await evaluateDecision({
      requestId,
      purpose: 'agent_route',
      intent: sanitizeDecisionText(
        `Role: ${input.role}\nTask: ${input.task}`,
        2_500,
      ),
      candidates,
      confidenceThreshold: AGENT_ROUTE_CONFIDENCE_THRESHOLD,
    }, input.signal);

    const selected = result.selections[0]?.candidateId;
    const selectedEngine = isSubagentEngine(selected) && input.engines.includes(selected)
      ? selected
      : null;
    const accepted = (
      result.escalated !== true &&
      result.confidence >= AGENT_ROUTE_CONFIDENCE_THRESHOLD &&
      selectedEngine !== null
    );
    const applied = runtime.mode === 'active' && accepted;

    decisionTraceBuffer.record({
      requestId,
      purpose: 'agent_route',
      mode: runtime.mode,
      provider: result.provider || runtime.provider.id,
      ...(result.model ? { model: result.model } : {}),
      candidateIds: candidates.map((candidate) => candidate.id),
      selectedIds: selectedEngine ? [selectedEngine] : [],
      confidence: result.confidence,
      threshold: AGENT_ROUTE_CONFIDENCE_THRESHOLD,
      ...(!accepted
        ? {
          fallbackReason: result.escalationReason ?? (
            result.confidence < AGENT_ROUTE_CONFIDENCE_THRESHOLD
              ? 'low_confidence'
              : 'no_selection'
          ),
        }
        : {}),
      latencyMs: Date.now() - startedAt,
      applied,
    });

    return applied ? selectedEngine : null;
  } catch {
    decisionTraceBuffer.record({
      requestId,
      purpose: 'agent_route',
      mode: runtime.mode,
      provider: runtime.provider.id,
      candidateIds: candidates.map((candidate) => candidate.id),
      selectedIds: [],
      threshold: AGENT_ROUTE_CONFIDENCE_THRESHOLD,
      fallbackReason: 'provider_error',
      latencyMs: Date.now() - startedAt,
      applied: false,
    });
    return null;
  }
}

function resolveSubagentDescriptor(
  call: ToolCall,
  descriptors: readonly ToolDescriptor[],
): ToolDescriptor | null {
  if (call.descriptorId) {
    const exact = descriptors.find((descriptor) => descriptor.id === call.descriptorId);
    if (exact) return exact;
  }
  if (call.invocationName) {
    const exact = descriptors.find(
      (descriptor) => descriptor.invocationName === call.invocationName,
    );
    if (exact) return exact;
  }
  if (call.provider?.id) {
    return descriptors.find((descriptor) => (
      descriptor.provider.id === call.provider?.id &&
      descriptor.name === call.name
    )) ?? null;
  }
  return null;
}

function subagentToolName(descriptor: ToolDescriptor | undefined): string {
  if (!descriptor) return '';
  if (
    descriptor.provider.kind !== 'mcp' ||
    descriptor.provider.displayName !== 'Subagent Manager'
  ) {
    return '';
  }
  return descriptor.annotations?.mcpToolName || descriptor.name;
}

async function readEngineAvailability(
  signal?: AbortSignal,
): Promise<EngineAvailability> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_200);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const response = await fetch(SUBAGENT_HEALTH_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return unavailableEngines();
    const raw = await response.json() as unknown;
    if (!isPlainRecord(raw) || !isPlainRecord(raw.availability)) {
      return unavailableEngines();
    }
    const availability = raw.availability;
    return {
      deepseek_web: availability.deepseek_web === true,
      gemini: availability.gemini === true,
      groq: availability.groq === true,
    };
  } catch {
    return unavailableEngines();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function availableEngines(
  availability: EngineAvailability,
): SubagentEngine[] {
  return (['deepseek_web', 'gemini', 'groq'] as const)
    .filter((engine) => availability[engine]);
}

function unavailableEngines(): EngineAvailability {
  return { deepseek_web: false, gemini: false, groq: false };
}

function readEngine(value: unknown): 'auto' | SubagentEngine | null {
  if (value === undefined || value === null || value === '') return 'auto';
  if (value === 'auto') return 'auto';
  return isSubagentEngine(value) ? value : null;
}

function isSubagentEngine(value: unknown): value is SubagentEngine {
  return value === 'deepseek_web' || value === 'gemini' || value === 'groq';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
