import type { ToolDescriptor } from '../tool/types';

export const JEV_SHADOW_SETTINGS_STORAGE_KEY = 'deepseek_pp_jev_shadow_settings';
export const JEV_SHADOW_API_KEY_STORAGE_KEY = 'deepseek_pp_jev_api_key';
export const JEV_SHADOW_SETTINGS_VERSION = 1 as const;
export const JEV_SYSTEM_ONE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_SHADOW_TELEMETRY_LIMIT = 100;

export interface JevShadowSettings {
  version: typeof JEV_SHADOW_SETTINGS_VERSION;
  enabled: boolean;
  model: string;
  timeoutMs: number;
  maxCandidates: number;
}

export const DEFAULT_JEV_SHADOW_SETTINGS: JevShadowSettings = Object.freeze({
  version: JEV_SHADOW_SETTINGS_VERSION,
  enabled: false,
  model: 'jev-latest',
  timeoutMs: 2_000,
  maxCandidates: 32,
});

export type JevShadowObservationStatus =
  | 'disabled'
  | 'missing_api_key'
  | 'no_candidates'
  | 'ok'
  | 'error';

export interface McpJevShadowObservation {
  at: number;
  status: JevShadowObservationStatus;
  queryChars: number;
  candidateCount: number;
  lexicalTopIds: string[];
  semanticTopIds?: string[];
  choiceDescriptorId?: string;
  confidence?: number;
  durationMs: number;
  model?: string;
  errorCode?: string;
}

export interface RunMcpDiscoveryJevShadowInput {
  query: string;
  candidates: readonly ToolDescriptor[];
  lexicalSelectedIds: readonly string[];
  fetchImpl?: typeof fetch;
}

interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export class JevShadowSettingsError extends Error {
  readonly code:
    | 'jev_shadow_settings_invalid'
    | 'jev_shadow_settings_version_unsupported';

  constructor(
    code: JevShadowSettingsError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'JevShadowSettingsError';
    this.code = code;
  }
}

const observations: McpJevShadowObservation[] = [];

export async function getJevShadowSettings(): Promise<JevShadowSettings> {
  const data = await chrome.storage.local.get(JEV_SHADOW_SETTINGS_STORAGE_KEY) as Record<string, unknown>;
  if (!Object.hasOwn(data, JEV_SHADOW_SETTINGS_STORAGE_KEY)) {
    return DEFAULT_JEV_SHADOW_SETTINGS;
  }
  return decodeJevShadowSettings(data[JEV_SHADOW_SETTINGS_STORAGE_KEY]);
}

export async function updateJevShadowSettings(
  patch: Partial<Omit<JevShadowSettings, 'version'>>,
): Promise<JevShadowSettings> {
  const current = await getJevShadowSettings();
  const next = decodeJevShadowSettings({
    ...current,
    ...patch,
    version: JEV_SHADOW_SETTINGS_VERSION,
  });
  await chrome.storage.local.set({ [JEV_SHADOW_SETTINGS_STORAGE_KEY]: next });
  return next;
}

export function decodeJevShadowSettings(value: unknown): JevShadowSettings {
  const record = asPlainRecord(value);
  if (!record || !Number.isInteger(record.version)) {
    throw new JevShadowSettingsError(
      'jev_shadow_settings_invalid',
      'JEV shadow settings must be a versioned object.',
    );
  }
  if (record.version !== JEV_SHADOW_SETTINGS_VERSION) {
    throw new JevShadowSettingsError(
      'jev_shadow_settings_version_unsupported',
      `Unsupported JEV shadow settings version: ${String(record.version)}.`,
    );
  }
  if (typeof record.enabled !== 'boolean') {
    throw new JevShadowSettingsError(
      'jev_shadow_settings_invalid',
      'JEV shadow settings enabled must be boolean.',
    );
  }
  const model = normalizeModel(record.model);
  const timeoutMs = normalizeBoundedInteger(record.timeoutMs, 250, 15_000);
  const maxCandidates = normalizeBoundedInteger(record.maxCandidates, 1, 255);
  if (!model || timeoutMs === null || maxCandidates === null) {
    throw new JevShadowSettingsError(
      'jev_shadow_settings_invalid',
      'JEV shadow settings contain an invalid model, timeout, or candidate limit.',
    );
  }
  return {
    version: JEV_SHADOW_SETTINGS_VERSION,
    enabled: record.enabled,
    model,
    timeoutMs,
    maxCandidates,
  };
}

export async function getJevShadowApiKey(): Promise<string | null> {
  const data = await chrome.storage.local.get(JEV_SHADOW_API_KEY_STORAGE_KEY) as Record<string, unknown>;
  return normalizeApiKey(data[JEV_SHADOW_API_KEY_STORAGE_KEY]);
}

export async function saveJevShadowApiKey(apiKey: string): Promise<void> {
  const normalized = normalizeApiKey(apiKey);
  if (!normalized) throw new Error('TypeSafe API key cannot be empty.');
  await chrome.storage.local.set({ [JEV_SHADOW_API_KEY_STORAGE_KEY]: normalized });
}

export async function clearJevShadowApiKey(): Promise<void> {
  await chrome.storage.local.remove(JEV_SHADOW_API_KEY_STORAGE_KEY);
}

export function getJevShadowTelemetry(): McpJevShadowObservation[] {
  return observations.map((observation) => ({
    ...observation,
    lexicalTopIds: [...observation.lexicalTopIds],
    ...(observation.semanticTopIds ? { semanticTopIds: [...observation.semanticTopIds] } : {}),
  }));
}

export function clearJevShadowTelemetry(): void {
  observations.length = 0;
}

/**
 * Runs a semantic MCP ranking in shadow mode.
 *
 * This function never returns descriptors and never changes the caller's
 * routing choice. It records only bounded metadata; query text and candidate
 * descriptions are sent to Jev only when shadow mode is explicitly enabled,
 * but are never retained in the telemetry buffer.
 */
export async function runMcpDiscoveryJevShadow(
  input: RunMcpDiscoveryJevShadowInput,
): Promise<McpJevShadowObservation> {
  const startedAt = Date.now();
  let settings: JevShadowSettings;
  try {
    settings = await getJevShadowSettings();
  } catch (error) {
    return recordObservation({
      at: Date.now(),
      status: 'error',
      queryChars: input.query.length,
      candidateCount: input.candidates.length,
      lexicalTopIds: [...input.lexicalSelectedIds],
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof JevShadowSettingsError ? error.code : 'settings_read_failed',
    });
  }

  if (!settings.enabled) {
    return recordObservation({
      at: Date.now(),
      status: 'disabled',
      queryChars: input.query.length,
      candidateCount: input.candidates.length,
      lexicalTopIds: [...input.lexicalSelectedIds],
      durationMs: Date.now() - startedAt,
      model: settings.model,
    });
  }

  let apiKey: string | null;
  try {
    apiKey = await getJevShadowApiKey();
  } catch {
    apiKey = null;
  }
  if (!apiKey) {
    return recordObservation({
      at: Date.now(),
      status: 'missing_api_key',
      queryChars: input.query.length,
      candidateCount: input.candidates.length,
      lexicalTopIds: [...input.lexicalSelectedIds],
      durationMs: Date.now() - startedAt,
      model: settings.model,
    });
  }

  const candidates = input.candidates.slice(0, settings.maxCandidates);
  if (candidates.length === 0) {
    return recordObservation({
      at: Date.now(),
      status: 'no_candidates',
      queryChars: input.query.length,
      candidateCount: 0,
      lexicalTopIds: [...input.lexicalSelectedIds],
      durationMs: Date.now() - startedAt,
      model: settings.model,
    });
  }

  const optionKeys = candidates.map((_, index) => `c${index}`);
  const criteria = Object.fromEntries([
    ...candidates.map((descriptor, index) => [
      optionKeys[index]!,
      describeCandidate(descriptor),
    ] as const),
    ['none', 'No listed MCP tool is relevant to the requested task.'] as const,
  ]);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  const fetchImpl = input.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(JEV_SYSTEM_ONE_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model,
        state: {
          intent: input.query,
          candidates: candidates.map((descriptor, index) => ({
            option: optionKeys[index],
            id: descriptor.id,
            name: descriptor.name,
            title: descriptor.title,
            description: descriptor.description,
            provider: descriptor.provider.displayName,
            risk: descriptor.execution.risk,
          })),
        },
        questions: {
          tool: {
            type: 'choice',
            instructions:
              'Which listed MCP tool is the best semantic match for the requested task? ' +
              'Judge task relevance only. Authorization, side effects, and execution safety are enforced separately by code.',
            criteria,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return recordObservation({
        at: Date.now(),
        status: 'error',
        queryChars: input.query.length,
        candidateCount: candidates.length,
        lexicalTopIds: [...input.lexicalSelectedIds],
        durationMs: Date.now() - startedAt,
        model: settings.model,
        errorCode: `http_${response.status}`,
      });
    }

    const payload = await response.json() as unknown;
    const parsed = parseChoiceResponse(payload, new Set([...optionKeys, 'none']));
    if (!parsed) {
      return recordObservation({
        at: Date.now(),
        status: 'error',
        queryChars: input.query.length,
        candidateCount: candidates.length,
        lexicalTopIds: [...input.lexicalSelectedIds],
        durationMs: Date.now() - startedAt,
        model: settings.model,
        errorCode: 'response_invalid',
      });
    }

    const semanticTopIds = candidates
      .map((descriptor, index) => ({
        id: descriptor.id,
        probability: parsed.probabilities[optionKeys[index]!] ?? 0,
        index,
      }))
      .sort((left, right) => right.probability - left.probability || left.index - right.index)
      .map((entry) => entry.id);

    const choiceIndex = optionKeys.indexOf(parsed.choice);
    return recordObservation({
      at: Date.now(),
      status: 'ok',
      queryChars: input.query.length,
      candidateCount: candidates.length,
      lexicalTopIds: [...input.lexicalSelectedIds],
      semanticTopIds,
      ...(choiceIndex >= 0 ? { choiceDescriptorId: candidates[choiceIndex]!.id } : {}),
      confidence: parsed.confidence,
      durationMs: Date.now() - startedAt,
      model: readResponseModel(payload) ?? settings.model,
    });
  } catch (error) {
    return recordObservation({
      at: Date.now(),
      status: 'error',
      queryChars: input.query.length,
      candidateCount: candidates.length,
      lexicalTopIds: [...input.lexicalSelectedIds],
      durationMs: Date.now() - startedAt,
      model: settings.model,
      errorCode: isAbortError(error) ? 'timeout' : 'network_error',
    });
  } finally {
    clearTimeout(timer);
  }
}

function recordObservation(observation: McpJevShadowObservation): McpJevShadowObservation {
  observations.push(observation);
  if (observations.length > JEV_SHADOW_TELEMETRY_LIMIT) {
    observations.splice(0, observations.length - JEV_SHADOW_TELEMETRY_LIMIT);
  }
  return observation;
}

function parseChoiceResponse(
  value: unknown,
  allowedOptions: ReadonlySet<string>,
): JevChoiceAnswer | null {
  const root = asPlainRecord(value);
  const answers = asPlainRecord(root?.answers);
  const tool = asPlainRecord(answers?.tool);
  if (!tool || tool.type !== 'choice' || typeof tool.choice !== 'string') return null;
  if (!allowedOptions.has(tool.choice)) return null;
  if (!isProbability(tool.confidence)) return null;

  const rawProbabilities = asPlainRecord(tool.probabilities);
  if (!rawProbabilities) return null;
  const probabilities: Record<string, number> = {};
  for (const [key, raw] of Object.entries(rawProbabilities)) {
    if (!allowedOptions.has(key) || !isProbability(raw)) return null;
    probabilities[key] = raw;
  }
  if (Object.keys(probabilities).length === 0) return null;

  return {
    type: 'choice',
    choice: tool.choice,
    probabilities,
    confidence: tool.confidence,
  };
}

function readResponseModel(value: unknown): string | null {
  const record = asPlainRecord(value);
  const model = record?.model;
  return typeof model === 'string' && model.trim()
    ? model.trim()
    : null;
}

function describeCandidate(descriptor: ToolDescriptor): string {
  return [
    `Tool: ${descriptor.title}`,
    `Name: ${descriptor.name}`,
    `Provider: ${descriptor.provider.displayName}`,
    `Description: ${descriptor.description}`,
  ].join('\n');
}

function normalizeApiKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeModel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return trimmed;
}

function normalizeBoundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : null;
}
