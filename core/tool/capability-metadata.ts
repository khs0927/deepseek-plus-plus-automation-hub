import type { ToolDescriptor } from './types';

export type CapabilityEffect =
  | 'read'
  | 'compute'
  | 'write'
  | 'external_side_effect';

export type CapabilityDataSensitivity =
  | 'public'
  | 'internal'
  | 'sensitive';

export interface CapabilityMetadata {
  effect: CapabilityEffect | null;
  idempotent: boolean | null;
  parallelSafe: boolean | null;
  requiresApproval: boolean | null;
  resources: string[];
  resourceLocks: string[];
  dependencies: string[];
  dataSensitivity: CapabilityDataSensitivity | null;
}

const EFFECTS = new Set<CapabilityEffect>([
  'read',
  'compute',
  'write',
  'external_side_effect',
]);

const SENSITIVITIES = new Set<CapabilityDataSensitivity>([
  'public',
  'internal',
  'sensitive',
]);

export function readCapabilityMetadata(
  descriptor: ToolDescriptor,
): CapabilityMetadata {
  const annotations = descriptor.annotations ?? {};
  return {
    effect: readEffect(annotations),
    idempotent: readBoolean(
      annotations,
      ['dpp.idempotent', 'idempotentHint', 'idempotent'],
    ),
    parallelSafe: readBoolean(
      annotations,
      ['dpp.parallelSafe', 'parallelSafe'],
    ),
    requiresApproval: readBoolean(
      annotations,
      ['dpp.requiresApproval', 'requiresApproval'],
    ),
    resources: readStringList(
      annotations,
      ['dpp.resources', 'resources'],
    ),
    resourceLocks: readStringList(
      annotations,
      ['dpp.resourceLocks', 'resourceLocks'],
    ),
    dependencies: readStringList(
      annotations,
      ['dpp.dependencies', 'dependencies'],
    ),
    dataSensitivity: readSensitivity(annotations),
  };
}

export function readBoolean(
  annotations: Readonly<Record<string, string>>,
  keys: readonly string[],
): boolean | null {
  for (const key of keys) {
    const raw = annotations[key];
    if (raw === undefined) continue;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'boolean') return parsed;
    } catch {
      // Ignore malformed annotation values and continue to the next key.
    }
  }
  return null;
}

export function readStringList(
  annotations: Readonly<Record<string, string>>,
  keys: readonly string[],
): string[] {
  for (const key of keys) {
    const raw = annotations[key];
    if (raw === undefined) continue;
    const parsed = parseStringList(raw);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function readEffect(
  annotations: Readonly<Record<string, string>>,
): CapabilityEffect | null {
  const raw = annotations['dpp.effect'] ?? annotations.effect;
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase() as CapabilityEffect;
  return EFFECTS.has(normalized) ? normalized : null;
}

function readSensitivity(
  annotations: Readonly<Record<string, string>>,
): CapabilityDataSensitivity | null {
  const raw = annotations['dpp.dataSensitivity'] ?? annotations.dataSensitivity;
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase() as CapabilityDataSensitivity;
  return SENSITIVITIES.has(normalized) ? normalized : null;
}

function parseStringList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return normalizeStrings(parsed);
    }
  } catch {
    // Fall through to comma/newline-delimited parsing.
  }

  return normalizeStrings(trimmed.split(/[\n,]+/));
}

function normalizeStrings(values: readonly unknown[]): string[] {
  const normalized = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 64);
  return [...new Set(normalized)];
}
