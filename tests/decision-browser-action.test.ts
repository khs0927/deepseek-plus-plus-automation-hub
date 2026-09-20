import { afterEach, describe, expect, it } from 'vitest';
import {
  buildBrowserActionCandidates,
  decideBrowserActionWithJev,
} from '../core/decision/browser-action';
import { MockDecisionProvider } from '../core/decision/mock-provider';
import {
  configureDecisionRuntime,
  resetDecisionRuntimeForTests,
} from '../core/decision/provider';
import { decisionTraceBuffer } from '../core/decision/trace';
import type { BrowserSnapshotResult } from '../core/browser-control/types';

afterEach(() => {
  resetDecisionRuntimeForTests();
  decisionTraceBuffer.clear();
});

describe('JEV browser action selection', () => {
  it('builds only observed node-bound actions plus bounded control actions', () => {
    const candidates = buildBrowserActionCandidates(snapshot());

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'click:e2',
      'fill:e3',
      'click:e4',
      'fill:e4',
      'scroll_up',
      'scroll_down',
      'wait',
      'done',
      'blocked',
    ]);
    expect(candidates.some((candidate) => candidate.id.includes('e5'))).toBe(false);
  });

  it('uses JEV in active mode and records the applied decision', async () => {
    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider((request) => {
        expect(request.purpose).toBe('browser_action');
        expect(request.intent).toContain('Book the current search');
        expect(request.candidates.map((candidate) => candidate.id)).toContain('click:e2');
        return {
          provider: 'mock-jev',
          model: 'jev-test',
          confidence: 0.93,
          selections: [
            { candidateId: 'click:e2', confidence: 0.93 },
          ],
        };
      }),
    });

    const decision = await decideBrowserActionWithJev(
      'Book the current search',
      snapshot(),
    );

    expect(decision).toMatchObject({
      action: {
        operation: 'click',
        uid: 'e2',
        role: 'button',
        name: 'Search',
      },
      confidence: 0.93,
      provider: 'mock-jev',
      model: 'jev-test',
    });
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      purpose: 'browser_action',
      applied: true,
      selectedIds: ['click:e2'],
    });
  });

  it('fails closed when JEV is not active instead of guessing an action', async () => {
    configureDecisionRuntime({
      mode: 'shadow',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        confidence: 1,
        selections: [{ candidateId: 'click:e2', confidence: 1 }],
      })),
    });

    await expect(
      decideBrowserActionWithJev('Search', snapshot()),
    ).rejects.toThrow('active configured decision provider');
  });

  it('fails closed on low-confidence decisions', async () => {
    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock-jev',
        confidence: 0.51,
        selections: [{ candidateId: 'click:e2', confidence: 0.51 }],
      })),
    });

    await expect(
      decideBrowserActionWithJev('Search', snapshot()),
    ).rejects.toThrow('below 0.72');
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      purpose: 'browser_action',
      applied: false,
      fallbackReason: 'low_confidence',
    });
  });
});

function snapshot(): BrowserSnapshotResult {
  return {
    url: 'https://example.com/search',
    title: 'Search',
    text: 'Search page',
    truncated: false,
    nodes: [
      {
        uid: 'e1',
        role: 'RootWebArea',
        name: 'Search',
        level: 0,
      },
      {
        uid: 'e2',
        role: 'button',
        name: 'Search',
        level: 1,
        backendDOMNodeId: 2,
      },
      {
        uid: 'e3',
        role: 'textbox',
        name: 'Destination',
        value: '',
        level: 1,
        backendDOMNodeId: 3,
      },
      {
        uid: 'e4',
        role: 'combobox',
        name: 'Class',
        value: 'Economy',
        level: 1,
        backendDOMNodeId: 4,
      },
      {
        uid: 'e5',
        role: 'button',
        name: 'Disabled',
        disabled: true,
        level: 1,
        backendDOMNodeId: 5,
      },
    ],
  };
}
