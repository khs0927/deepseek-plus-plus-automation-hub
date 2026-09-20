import type {
  DecisionEscalationReason,
  DecisionPurpose,
} from './contract';
import type { DecisionRuntimeMode } from './provider';

const DECISION_TRACE_LIMIT = 200;

export interface DecisionTraceEntry {
  requestId: string;
  purpose: DecisionPurpose;
  mode: DecisionRuntimeMode;
  provider: string;
  model?: string;
  candidateIds: string[];
  selectedIds: string[];
  confidence?: number;
  threshold: number;
  fallbackReason?: DecisionEscalationReason | 'low_confidence' | 'no_selection';
  latencyMs: number;
  applied: boolean;
  timestamp: string;
}

const entries: DecisionTraceEntry[] = [];

export const decisionTraceBuffer = {
  record(entry: Omit<DecisionTraceEntry, 'timestamp'>): void {
    entries.push({
      ...entry,
      candidateIds: [...entry.candidateIds],
      selectedIds: [...entry.selectedIds],
      timestamp: new Date().toISOString(),
    });
    if (entries.length > DECISION_TRACE_LIMIT) {
      entries.splice(0, entries.length - DECISION_TRACE_LIMIT);
    }
  },

  list(): DecisionTraceEntry[] {
    return entries.map((entry) => ({
      ...entry,
      candidateIds: [...entry.candidateIds],
      selectedIds: [...entry.selectedIds],
    }));
  },

  clear(): void {
    entries.length = 0;
  },
};
