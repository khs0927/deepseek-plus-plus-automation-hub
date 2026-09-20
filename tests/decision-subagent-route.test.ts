import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockDecisionProvider } from '../core/decision/mock-provider';
import {
  configureDecisionRuntime,
  resetDecisionRuntimeForTests,
} from '../core/decision/provider';
import { routeSubagentCall } from '../core/decision/subagent-route';
import { decisionTraceBuffer } from '../core/decision/trace';
import type { ToolCall, ToolDescriptor } from '../core/tool/types';

afterEach(() => {
  resetDecisionRuntimeForTests();
  decisionTraceBuffer.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('JEV Subagent engine routing', () => {
  it('routes engine:auto to an available engine in active mode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      availability: {
        deepseek_web: true,
        gemini: true,
        groq: false,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider((request) => {
        expect(request.purpose).toBe('agent_route');
        expect(request.candidates.map((candidate) => candidate.id)).toEqual([
          'deepseek_web',
          'gemini',
        ]);
        return {
          provider: 'mock',
          confidence: 0.95,
          selections: [{ candidateId: 'gemini', confidence: 0.95 }],
        };
      }),
    });

    const descriptor = subagentDescriptor('invoke_subagent');
    const call = subagentCall(descriptor, {
      role: 'Code Reviewer',
      task: 'Review this patch for race conditions.',
      engine: 'auto',
      background: false,
    });

    const routed = await routeSubagentCall({
      call,
      currentDescriptors: [descriptor],
    });

    expect(routed.payload).toMatchObject({ engine: 'gemini' });
    expect(routed.id).toBe(call.id);
    expect(routed.name).toBe(call.name);
    expect(routed.provider).toEqual(call.provider);
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      purpose: 'agent_route',
      selectedIds: ['gemini'],
      applied: true,
    });
  });

  it('does not perform health or JEV routing for an explicit engine', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new MockDecisionProvider(() => {
      throw new Error('should not be called');
    });
    configureDecisionRuntime({ mode: 'active', provider });

    const descriptor = subagentDescriptor('invoke_subagent');
    const call = subagentCall(descriptor, {
      role: 'Researcher',
      task: 'Research the issue.',
      engine: 'groq',
    });

    const routed = await routeSubagentCall({
      call,
      currentDescriptors: [descriptor],
    });

    expect(routed).toEqual(call);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(decisionTraceBuffer.list()).toEqual([]);
  });

  it('keeps engine:auto unchanged in shadow mode while tracing the route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      availability: {
        deepseek_web: true,
        gemini: true,
        groq: false,
      },
    }), { status: 200 })));

    configureDecisionRuntime({
      mode: 'shadow',
      provider: new MockDecisionProvider(() => ({
        provider: 'mock',
        confidence: 0.93,
        selections: [{ candidateId: 'gemini', confidence: 0.93 }],
      })),
    });

    const descriptor = subagentDescriptor('invoke_subagent');
    const call = subagentCall(descriptor, {
      role: 'Reviewer',
      task: 'Review the implementation.',
      engine: 'auto',
    });

    const routed = await routeSubagentCall({
      call,
      currentDescriptors: [descriptor],
    });

    expect(routed.payload).toMatchObject({ engine: 'auto' });
    expect(decisionTraceBuffer.list()[0]).toMatchObject({
      purpose: 'agent_route',
      applied: false,
    });
  });

  it('routes only auto tasks in a small batch and preserves explicit engines', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      availability: {
        deepseek_web: true,
        gemini: true,
        groq: true,
      },
    }), { status: 200 })));

    configureDecisionRuntime({
      mode: 'active',
      provider: new MockDecisionProvider((request) => ({
        provider: 'mock',
        confidence: 0.91,
        selections: [{
          candidateId: request.candidates.some((candidate) => candidate.id === 'groq')
            ? 'groq'
            : request.candidates[0]!.id,
          confidence: 0.91,
        }],
      })),
    });

    const descriptor = subagentDescriptor('invoke_subagent_batch');
    const call = subagentCall(descriptor, {
      tasks: [
        { role: 'A', task: 'Task A', engine: 'auto' },
        { role: 'B', task: 'Task B', engine: 'gemini' },
      ],
      background: false,
    });

    const routed = await routeSubagentCall({
      call,
      currentDescriptors: [descriptor],
    });
    const tasks = (routed.payload as { tasks: Array<{ engine: string }> }).tasks;

    expect(tasks[0]!.engine).toBe('groq');
    expect(tasks[1]!.engine).toBe('gemini');
  });

  it('keeps auto when fewer than two engines are available', async () => {
    const provider = new MockDecisionProvider(() => {
      throw new Error('should not be called with one engine');
    });
    configureDecisionRuntime({ mode: 'active', provider });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      availability: {
        deepseek_web: true,
        gemini: false,
        groq: false,
      },
    }), { status: 200 })));

    const descriptor = subagentDescriptor('invoke_subagent');
    const call = subagentCall(descriptor, {
      role: 'A',
      task: 'Task A',
      engine: 'auto',
    });

    await expect(routeSubagentCall({
      call,
      currentDescriptors: [descriptor],
    })).resolves.toEqual(call);
    expect(decisionTraceBuffer.list()).toEqual([]);
  });
});

function subagentDescriptor(name: string): ToolDescriptor {
  return {
    id: `mcp:subagent:${name}`,
    provider: {
      kind: 'mcp',
      id: 'subagent-manager',
      displayName: 'Subagent Manager',
      transport: 'sse',
    },
    name,
    invocationName: `mcp_subagent_manager_${name}`,
    title: name,
    description: name,
    inputSchema: { type: 'object' },
    execution: {
      mode: 'auto',
      enabled: true,
      risk: 'low',
    },
    annotations: {
      mcpToolName: name,
    },
  };
}

function subagentCall(
  descriptor: ToolDescriptor,
  payload: Record<string, unknown>,
): ToolCall {
  return {
    id: 'subagent-call',
    descriptorId: descriptor.id,
    provider: descriptor.provider,
    name: descriptor.name,
    invocationName: descriptor.invocationName,
    payload,
    raw: '<subagent>{}</subagent>',
    source: { trigger: 'test', requestId: 'route-test' },
  };
}
