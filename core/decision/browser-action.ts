import type {
  BrowserSnapshotNode,
  BrowserSnapshotResult,
} from '../browser-control/types';
import {
  evaluateDecision,
  getDecisionRuntimeConfig,
} from './provider';
import { sanitizeDecisionText } from './sanitize';
import { decisionTraceBuffer } from './trace';

const BROWSER_ACTION_CONFIDENCE_THRESHOLD = 0.72;
const MAX_BROWSER_ACTION_CANDIDATES = 240;

const CLICKABLE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'option',
  'treeitem',
]);

const TEXT_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
]);

export type BrowserJevOperation =
  | 'click'
  | 'fill'
  | 'scroll_up'
  | 'scroll_down'
  | 'wait'
  | 'done'
  | 'blocked';

export interface BrowserJevAction {
  operation: BrowserJevOperation;
  uid?: string;
  role?: string;
  name?: string;
}

export interface BrowserJevDecision {
  action: BrowserJevAction;
  confidence: number;
  provider: string;
  model?: string;
  latencyMs: number;
}

interface BrowserActionCandidate {
  id: string;
  action: BrowserJevAction;
  title: string;
  description: string;
  risk: 'low' | 'medium';
}

export function buildBrowserActionCandidates(
  snapshot: BrowserSnapshotResult,
): BrowserActionCandidate[] {
  const candidates: BrowserActionCandidate[] = [];

  for (const node of snapshot.nodes) {
    if (
      candidates.length >= MAX_BROWSER_ACTION_CANDIDATES - 5 ||
      node.disabled === true ||
      typeof node.backendDOMNodeId !== 'number'
    ) {
      continue;
    }

    const role = node.role.trim().toLowerCase();
    if (CLICKABLE_ROLES.has(role) || role === 'combobox') {
      candidates.push(candidateForNode('click', node));
    }
    if (
      candidates.length < MAX_BROWSER_ACTION_CANDIDATES - 5 &&
      TEXT_ROLES.has(role)
    ) {
      candidates.push(candidateForNode('fill', node));
    }
  }

  candidates.push(
    {
      id: 'scroll_up',
      action: { operation: 'scroll_up' },
      title: 'Scroll up',
      description: 'Scroll upward to reveal content above the current viewport.',
      risk: 'low',
    },
    {
      id: 'scroll_down',
      action: { operation: 'scroll_down' },
      title: 'Scroll down',
      description: 'Scroll downward to reveal more content below the current viewport.',
      risk: 'low',
    },
    {
      id: 'wait',
      action: { operation: 'wait' },
      title: 'Wait briefly',
      description: 'Wait briefly because the current page is still changing or loading.',
      risk: 'low',
    },
    {
      id: 'done',
      action: { operation: 'done' },
      title: 'Goal appears complete',
      description: 'The current observation appears to satisfy the goal. This is only a candidate and is not independent proof of completion.',
      risk: 'low',
    },
    {
      id: 'blocked',
      action: { operation: 'blocked' },
      title: 'Cannot safely continue',
      description: 'The goal cannot be advanced safely from the current observation without stronger reasoning, user input, sign-in, or approval.',
      risk: 'low',
    },
  );

  return candidates.slice(0, MAX_BROWSER_ACTION_CANDIDATES);
}

export async function decideBrowserActionWithJev(
  goal: string,
  snapshot: BrowserSnapshotResult,
  signal?: AbortSignal,
): Promise<BrowserJevDecision> {
  const runtime = getDecisionRuntimeConfig();
  if (runtime.mode !== 'active' || !runtime.provider) {
    throw new Error('JEV browser decisions require an active configured decision provider.');
  }

  const candidates = buildBrowserActionCandidates(snapshot);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const result = await evaluateDecision({
      requestId,
      purpose: 'browser_action',
      intent: sanitizeDecisionText([
        'Advance the browser goal by exactly one safe action.',
        `Goal: ${goal}`,
        `Current URL: ${snapshot.url}`,
        `Current title: ${snapshot.title}`,
      ].join(' '), 4_000),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.id,
        title: sanitizeDecisionText(candidate.title, 240),
        description: sanitizeDecisionText(candidate.description, 900),
        provider: 'browser-control',
        risk: candidate.risk,
      })),
      confidenceThreshold: BROWSER_ACTION_CONFIDENCE_THRESHOLD,
    }, signal);

    const selected = result.selections[0];
    const candidate = selected ? byId.get(selected.candidateId) : undefined;
    const confidence = selected?.confidence ?? result.confidence;
    const applied = Boolean(
      candidate &&
      result.escalated !== true &&
      confidence >= BROWSER_ACTION_CONFIDENCE_THRESHOLD
    );
    const latencyMs = Date.now() - startedAt;

    decisionTraceBuffer.record({
      requestId,
      purpose: 'browser_action',
      mode: runtime.mode,
      provider: result.provider || runtime.provider.id,
      ...(result.model ? { model: result.model } : {}),
      candidateIds: candidates.map((item) => item.id),
      selectedIds: selected ? [selected.candidateId] : [],
      confidence,
      threshold: BROWSER_ACTION_CONFIDENCE_THRESHOLD,
      ...(!applied
        ? {
          fallbackReason: result.escalationReason ?? (
            selected ? 'low_confidence' : 'no_selection'
          ),
        }
        : {}),
      latencyMs,
      applied,
    });

    if (!candidate || !applied) {
      throw new Error(
        result.escalationReason
          ? `JEV browser decision escalated: ${result.escalationReason}`
          : `JEV browser decision confidence ${confidence.toFixed(3)} is below ${BROWSER_ACTION_CONFIDENCE_THRESHOLD}.`,
      );
    }

    return {
      action: candidate.action,
      confidence,
      provider: result.provider || runtime.provider.id,
      ...(result.model ? { model: result.model } : {}),
      latencyMs,
    };
  } catch (error) {
    if (!decisionTraceBuffer.list().some((entry) => entry.requestId === requestId)) {
      decisionTraceBuffer.record({
        requestId,
        purpose: 'browser_action',
        mode: runtime.mode,
        provider: runtime.provider.id,
        candidateIds: candidates.map((item) => item.id),
        selectedIds: [],
        threshold: BROWSER_ACTION_CONFIDENCE_THRESHOLD,
        fallbackReason: 'provider_error',
        latencyMs: Date.now() - startedAt,
        applied: false,
      });
    }
    throw error;
  }
}

function candidateForNode(
  operation: 'click' | 'fill',
  node: BrowserSnapshotNode,
): BrowserActionCandidate {
  const role = node.role.trim().toLowerCase() || 'element';
  const name = node.name.trim();
  const value = node.value?.trim();
  const state = [
    value ? `current value: ${value}` : '',
    node.checked !== undefined ? `checked: ${String(node.checked)}` : '',
    node.selected !== undefined ? `selected: ${String(node.selected)}` : '',
    node.focused === true ? 'focused' : '',
  ].filter(Boolean).join('; ');

  return {
    id: `${operation}:${node.uid}`,
    action: {
      operation,
      uid: node.uid,
      role,
      name,
    },
    title: `${operation === 'click' ? 'Click' : 'Fill'} ${role} ${name || node.uid}`,
    description: [
      `Observed accessibility node ${node.uid}.`,
      `Role: ${role}.`,
      name ? `Accessible name: ${name}.` : '',
      node.description ? `Description: ${node.description}.` : '',
      state ? `State: ${state}.` : '',
      operation === 'fill'
        ? 'Choose this only when this observed text-like control should receive text for the browser goal.'
        : 'Choose this only when activating this observed control advances the browser goal.',
    ].filter(Boolean).join(' '),
    risk: 'medium',
  };
}
