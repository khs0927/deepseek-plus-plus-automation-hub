export const DECISION_PURPOSES = [
  'mcp_rank',
  'mcp_fanout',
  'result_judge',
  'browser_action',
  'skill_rank',
  'agent_route',
  'model_route',
] as const;

export type DecisionPurpose = typeof DECISION_PURPOSES[number];

export const DECISION_ESCALATION_REASONS = [
  'writing',
  'open_ended',
  'oversized',
  'unsure',
  'unreachable',
  'provider_error',
  'invalid_result',
] as const;

export type DecisionEscalationReason = typeof DECISION_ESCALATION_REASONS[number];

export interface DecisionCandidate {
  id: string;
  name: string;
  title: string;
  description: string;
  provider?: string;
  risk?: 'low' | 'medium' | 'high';
}

export interface DecisionRequest {
  requestId: string;
  purpose: DecisionPurpose;
  intent: string;
  candidates: DecisionCandidate[];
  confidenceThreshold?: number;
}

export interface DecisionSelection {
  candidateId: string;
  confidence: number;
  score?: number;
}

export interface DecisionResult {
  provider: string;
  model?: string;
  confidence: number;
  selections: DecisionSelection[];
  escalated?: boolean;
  escalationReason?: DecisionEscalationReason;
}
