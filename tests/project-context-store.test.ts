import { webcrypto } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMORY_DATABASE_NAME, MEMORY_TABLE_NAME, MEMORY_TABLE_SCHEMAS } from '../core/memory/schema';
import { formatMemoryLine, selectMemories } from '../core/memory/selector';
import type { Memory } from '../core/types';
import { addIndexedDbRecords, createIndexedDbAtVersion, createStore, deleteIndexedDb } from './helpers/indexeddb';

const indexedDbFactory = new IDBFactory();
const projectMocks = vi.hoisted(() => ({
  getProjectForConversation: vi.fn(),
}));

vi.mock('../core/project/store', () => projectMocks);

beforeAll(() => {
  vi.stubGlobal('indexedDB', indexedDbFactory);
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('crypto', webcrypto);
});

beforeEach(() => {
  projectMocks.getProjectForConversation.mockImplementation(async (conversationId: string) => (
    conversationId === 'conversation-1' ? { id: 'project-1' } : { id: 'project-2' }
  ));
});

afterEach(async () => {
  const { db } = await import('../core/memory/store');
  db.close();
  await deleteIndexedDb(MEMORY_DATABASE_NAME);
  vi.clearAllMocks();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('project context shared persistence', () => {
  it('migrates v3 memory rows to v4 without changing ids or unknown fields', async () => {
    const historical = {
      id: 7,
      syncId: 'memory-sync-7',
      scope: 'global',
      type: 'reference',
      name: 'historical',
      content: 'preserve me',
      description: '',
      tags: ['migration'],
      pinned: false,
      createdAt: 1,
      updatedAt: 2,
      accessCount: 0,
      lastAccessedAt: 2,
      futureField: { keep: true },
    };
    await createIndexedDbAtVersion(MEMORY_DATABASE_NAME, 30, (database) => {
      const schema = MEMORY_TABLE_SCHEMAS[3].split(',').map((token) => token.trim());
      createStore(database, MEMORY_TABLE_NAME, {
        keyPath: schema[0].slice(2),
        autoIncrement: true,
        indexes: schema.slice(1),
      });
    });
    await addIndexedDbRecords(MEMORY_DATABASE_NAME, MEMORY_TABLE_NAME, [historical]);

    const { db, getAllMemories } = await import('../core/memory/store');
    await db.open();
    expect(db.backendDB().version).toBe(40);
    expect(db.backendDB().objectStoreNames.contains('project_context_records')).toBe(true);
    expect(db.backendDB().objectStoreNames.contains('project_context_runs')).toBe(true);
    expect(db.backendDB().objectStoreNames.contains('project_context_sharing')).toBe(true);
    await expect(getAllMemories()).resolves.toEqual([historical]);
  });

  it('captures source-backed Korean records, deduplicates hashes, supersedes revisions, and fences projects', async () => {
    const {
      captureCompletedMessage,
      getProjectContextSharing,
      listProjectContext,
      searchProjectContext,
      setSharing,
    } = await import('../core/project-context');

    const first = await captureCompletedMessage('conversation-1', 'message-1', 'branch-a', 'assistant', '한국어 프로젝트 결정사항 DeepSeek');
    expect(first?.deduplicated).toBe(false);
    const duplicate = await captureCompletedMessage('conversation-1', 'message-1', 'branch-a', 'assistant', '한국어 프로젝트 결정사항 DeepSeek');
    expect(duplicate?.deduplicated).toBe(true);

    const revised = await captureCompletedMessage('conversation-1', 'message-1', 'branch-a', 'assistant', '수정된 프로젝트 결정사항 DeepSeek');
    expect(revised?.deduplicated).toBe(false);
    expect((await listProjectContext({ projectId: 'project-1', statuses: ['superseded'] })).map((record) => record.status)).toEqual(['superseded']);

    const result = await searchProjectContext({ projectId: 'project-1', query: '결정사항', budgetTokens: 2_000 });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.content).toContain('수정된');
    expect(result.usedTokens).toBeLessThanOrEqual(2_000);

    await setSharing('project-1', ['conversation-1']);
    expect((await searchProjectContext({ projectId: 'project-1', query: '결정사항' })).records).toEqual([]);
    expect((await searchProjectContext({ projectId: 'project-1', query: '결정사항', includeExcluded: true })).records).toHaveLength(1);
    expect((await getProjectContextSharing('project-1')).revision).toBe(1);

    const otherProject = await searchProjectContext({ projectId: 'project-2', query: '결정사항' });
    expect(otherProject.records).toEqual([]);
  });

  it('persists execution run leases with idempotency and rejects a foreign lease', async () => {
    const {
      claimProjectContextRun,
      completeProjectContextRun,
      createProjectContextRun,
      listProjectContextRuns,
    } = await import('../core/project-context');
    const input = { projectId: 'project-1', kind: 'execution' as const, idempotencyKey: 'run-key-1' };
    const created = await createProjectContextRun(input);
    await expect(createProjectContextRun(input)).resolves.toMatchObject({ id: created.id });
    const claimed = await claimProjectContextRun(created.id, 'lease-1', { projectId: 'project-1' });
    await expect(completeProjectContextRun(claimed.id, 'wrong-lease', { projectId: 'project-1' }))
      .rejects.toThrow('lease conflict');
    await expect(completeProjectContextRun(claimed.id, 'lease-1', { projectId: 'project-1' }))
      .resolves.toMatchObject({ status: 'completed' });
    await expect(listProjectContextRuns({ projectId: 'project-1' })).resolves.toHaveLength(1);
  });
});

describe('memory selector hard budget', () => {
  it('does not admit an oversized first memory and still fits later records', () => {
    const large = memory(1, 'large', '非常に長い内容 '.repeat(2_000));
    const small = memory(2, 'small', '짧은 결정');
    const budget = Math.max(1, Math.ceil(formatMemoryLine(small).length * 0.6));
    const selected = selectMemories('결정', [large, small], { budget });
    expect(selected.map((item) => item.id)).toEqual([2]);
  });
});

function memory(id: number, name: string, content: string): Memory {
  return {
    id,
    syncId: `sync-${id}`,
    scope: 'global',
    type: 'reference',
    name,
    content,
    description: '',
    tags: ['결정'],
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    accessCount: 0,
    lastAccessedAt: 1,
  };
}
