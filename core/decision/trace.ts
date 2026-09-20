import type {
  DecisionResult,
  DecisionRiskLevel,
  DecisionSurface,
} from './types';

/**
 * Bounded, redacted decision trace.
 *
 * The trace exists so Shadow Mode can compare the current deterministic route
 * against the Jev route and so "why was this MCP selected?" is answerable
 * later. It must never store raw sensitive state: only a state hash and
 * bounded/redacted metadata.
 */
export interface DecisionTraceRecord {
  id: string;
  createdAt: number;
  surface: DecisionSurface;
  /** Correlates with the surrounding tool call / task when available. */
  requestId?: string;
  taskId?: string;
  chatSessionId?: string | null;
  intentHash: string;
  intentPreview?: string;
  /** Hash of the serialized decision state; never the raw state. */
  stateHash?: string;
  candidateIds: string[];
  provider: string;
  requestedModelAlias?: string;
  modelAlias?: string;
  selectedIds: string[];
  primaryId?: string;
  confidence: number;
  threshold: number;
  distribution?: Record<string, number>;
  riskLevel?: DecisionRiskLevel;
  accepted: boolean;
  fallbackReason?: string;
  /** Route the deterministic layer would have produced, for shadow comparison. */
  baselineSelectedIds?: string[];
  latencyMs: number;
  tokenUsage?: DecisionResult['tokenUsage'];
  answerPreview?: string;
}

export interface DecisionTraceSink {
  record(entry: DecisionTraceRecord): void;
}

/**
 * Ring-buffer trace sink. Keeps a bounded number of records in memory and can
 * be extended later with a chrome.storage persistence sink. It never throws:
 * losing a trace must never fail a decision.
 */
export function createInMemoryTraceSink(maxRecords = 500): DecisionTraceSink & {
  snapshot(): DecisionTraceRecord[];
  clear(): void;
} {
  const records: DecisionTraceRecord[] = [];
  return {
    record(entry: DecisionTraceRecord): void {
      records.push(entry);
      if (records.length > maxRecords) {
        records.splice(0, records.length - maxRecords);
      }
    },
    snapshot(): DecisionTraceRecord[] {
      return records.slice();
    },
    clear(): void {
      records.length = 0;
    },
  };
}

/** A sink that discards everything, used when tracing is disabled. */
export function createNoopTraceSink(): DecisionTraceSink {
  return {
    record(): void {
      // intentionally empty
    },
  };
}

let traceSequence = 0;

export function createDecisionTraceId(): string {
  traceSequence += 1;
  return `jev-${Date.now().toString(36)}-${traceSequence.toString(36)}`;
}

/**
 * Cheap, non-cryptographic FNV-1a hash. Used only for redacted correlation
 * (intent / state hashes in traces), never for security decisions.
 */
export function hashDecisionState(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Truncates free text so a trace never stores unbounded model output. */
export function previewText(value: string | undefined, maxChars = 240): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\u2026`;
}
