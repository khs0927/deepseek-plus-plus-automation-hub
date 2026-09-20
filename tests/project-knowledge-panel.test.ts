import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectKnowledgePanel, {
  decodeProjectKnowledgeExportBundle,
} from '../entrypoints/sidepanel/components/ProjectKnowledgePanel';

let container: HTMLDivElement;
let root: Root | null;
let sendMessage: ReturnType<typeof vi.fn>;

const conversation = {
  conversationId: 'conversation-1',
  projectId: 'project-1',
  title: 'Release planning',
  url: 'https://chat.deepseek.com/a/conversation-1',
  addedAt: 1_000,
  lastSeenAt: 2_000,
};

const queryResult = {
  records: [{
    id: 'record-1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    kind: 'decision',
    content: 'Ship the migration behind a flag.',
    status: 'candidate',
    sourceRefs: ['message-42'],
    evidenceRefs: ['run-7'],
    createdAt: 1_000,
    updatedAt: 2_000,
    revision: 3,
  }],
  runs: [{
    runId: 'run-7',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    state: 'running',
    startedAt: 1_000,
    updatedAt: 2_000,
    toolName: 'knowledge_extract',
  }],
  sharing: {
    projectId: 'project-1',
    excludedConversationIds: [],
    revision: 4,
  },
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = null;
  sendMessage = vi.fn(async (message: { type?: string }) => {
    if (message.type === 'PROJECT_KNOWLEDGE_QUERY') return queryResult;
    if (message.type === 'PROJECT_RUNS_LIST') return queryResult.runs;
    if (message.type === 'PROJECT_KNOWLEDGE_MUTATE') return { ok: true };
    return { ok: true };
  });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderPanel() {
  await act(async () => {
    root = createRoot(container);
    root.render(React.createElement(ProjectKnowledgePanel, {
      projectId: 'project-1',
      conversations: [conversation],
    }));
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ProjectKnowledgePanel', () => {
  it('queries and displays records, provenance, sharing, and run state', async () => {
    await renderPanel();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'PROJECT_KNOWLEDGE_QUERY',
      payload: { projectId: 'project-1' },
    });
    expect(container.textContent).toContain('Ship the migration behind a flag.');
    expect(container.textContent).toContain('message-42');
    expect(container.textContent).toContain('run-7');
    expect(container.textContent).toContain('running');
  });

  it('resolves records and persists conversation exclusions through runtime mutations', async () => {
    await renderPanel();

    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    await act(async () => {
      select!.value = 'confirmed';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const resolveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '处理');
    expect(resolveButton).toBeTruthy();
    await act(async () => {
      resolveButton!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    await act(async () => {
      checkbox!.click();
    });
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '保存排除项');
    expect(saveButton).toBeTruthy();
    await act(async () => {
      saveButton!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PROJECT_KNOWLEDGE_MUTATE',
      payload: expect.objectContaining({ action: 'resolve', recordId: 'record-1', status: 'confirmed' }),
    }));
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PROJECT_KNOWLEDGE_MUTATE',
      payload: expect.objectContaining({ action: 'sharing', excludedConversationIds: ['conversation-1'] }),
    }));
  });

  it('exports a validated bundle and imports it through the runtime mutation', async () => {
    await renderPanel();
    const createObjectURL = vi.fn(() => 'blob:project-knowledge');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '导出 JSON');
    expect(exportButton).toBeTruthy();
    await act(async () => {
      exportButton!.click();
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'PROJECT_KNOWLEDGE_EXPORT',
      payload: { projectId: 'project-1' },
    });

    const bundle = {
      schemaVersion: 'deepseek-pp.project-context-export.v1',
      projectId: 'project-1',
      exportedAt: 3_000,
      records: [{
        schemaVersion: 1,
        id: 'record-1',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        branchId: 'conversation-1',
        content: 'A decision',
        contentHash: 'content-hash',
        source: {
          conversationId: 'conversation-1',
          messageId: 'message-1',
          branchId: 'conversation-1',
          role: 'assistant',
          sourceHash: 'source-hash',
        },
        sourceHash: 'source-hash',
        dedupKey: 'source-hash:content-hash',
        status: 'candidate',
        sharing: 'project',
        sharingRevision: 0,
        revision: 1,
        kind: 'decision',
        sourceRefs: ['message-1'],
        evidenceRefs: [],
        provenance: {
          source: 'conversation',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          branchId: 'conversation-1',
          role: 'assistant',
          capturedAt: 3_000,
        },
        createdAt: 3_000,
        capturedAt: 3_000,
        updatedAt: 3_000,
      }],
      sharing: queryResult.sharing,
    };
    expect(decodeProjectKnowledgeExportBundle(bundle).projectId).toBe('project-1');
    const file = new File([JSON.stringify(bundle)], 'knowledge.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(bundle) });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).toBeTruthy();
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });
    await act(async () => {
      input!.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PROJECT_KNOWLEDGE_MUTATE',
      payload: expect.objectContaining({ action: 'import', bundle }),
    }));
  });
});
