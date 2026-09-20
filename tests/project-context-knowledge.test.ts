import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMORY_DATABASE_NAME,
  MEMORY_TABLE_NAME,
  MEMORY_TABLE_SCHEMAS,
} from '../core/memory/schema';
import {
  addIndexedDbRecords,
  createIndexedDbAtVersion,
  createStore,
  deleteIndexedDb,
} from './helpers/indexeddb';

const indexedDbFactory = new IDBFactory();
const projectMocks = vi.hoisted(() => ({
  getProjectForConversation: vi.fn(),
}));

vi.mock('../core/project/store', () => projectMocks);
const legacyMemory = {
  id: 17,
  type: 'topic',
  name: 'legacy',
  content: 'keep this row',
  description: '',
  tags: ['legacy'],
  pinned: false,
  createdAt: 10,
  updatedAt: 20,
  accessCount: 0,
  lastAccessedAt: 20,
  syncId: '00000000-0000-4000-8000-000000000017',
  scope: 'global',
  futureField: { keep: true },
};

beforeAll(() => {
  vi.stubGlobal('indexedDB', indexedDbFactory);
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
});

beforeEach(() => {
  projectMocks.getProjectForConversation.mockImplementation(async (conversationId: string) => ({
    id: conversationId === 'conversation-1' ? 'project-1' : 'project-2',
  }));
});

afterEach(async () => {
  const { db } = await import('../core/memory/store');
  db.close();
  await deleteIndexedDb(MEMORY_DATABASE_NAME);
});

afterAll(() => vi.unstubAllGlobals());

describe('project conversation knowledge store', () => {
  it('deduplicates completed-message capture and searches Korean plus identifier variants', async () => {
    const { captureProjectKnowledge, searchProjectContext } = await import('../core/project-context');
    const input = {
      projectId: 'project-1',
      conversationId: 'conversation-1',
      branchId: 'main',
      messageId: 'message-1',
      role: 'assistant' as const,
      text: '배포 pipeline build_pipeline ABC-123',
      contentHash: 'content-hash-1',
    };

    const first = await captureProjectKnowledge(input);
    const second = await captureProjectKnowledge(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.record.id).toBe(first.record.id);

    const korean = await searchProjectContext({ projectId: 'project-1', query: '배포', limit: 10 });
    const identifier = await searchProjectContext({ projectId: 'project-1', query: 'build-pipeline ABC123', limit: 10 });
    expect(korean.records.map((record) => record.id)).toContain(first.record.id);
    expect(identifier.records.map((record) => record.id)).toContain(first.record.id);
  });

  it('round-trips resolved records, sharing state, unknown fields, and run leases', async () => {
    const {
      completeProjectContextRun,
      createProjectContextRun,
      exportProjectContext,
      importProjectContext,
      proposeProjectContext,
      setProjectContextConversationSharing,
      claimProjectContextRun,
      getProjectContextSharing,
    } = await import('../core/project-context');

    const proposed = await proposeProjectContext({
      projectId: 'project-2',
      conversationId: 'conversation-2',
      messageId: 'message-2',
      branchId: 'main',
      role: 'user',
      content: 'Decision: use the stable release channel.',
      kind: 'decision',
    });
    const run = await createProjectContextRun({
      projectId: 'project-2',
      conversationId: 'conversation-2',
      kind: 'execution',
      idempotencyKey: 'run-once',
    });
    const claimed = await claimProjectContextRun(run.id, 'lease-1', { projectId: 'project-2' });
    await completeProjectContextRun(claimed.id, 'lease-1', { projectId: 'project-2' }, 'done');
    await setProjectContextConversationSharing('project-2', ['conversation-private']);

    const snapshot = await exportProjectContext({ projectId: 'project-2', includeExcluded: true });
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.sharing?.excludedConversationIds).toEqual(['conversation-private']);
    expect(snapshot.records[0]).toMatchObject({ kind: 'decision', sourceRefs: ['message-2'] });

    const sharing = await getProjectContextSharing('project-2');
    expect(sharing.revision).toBe(1);
    expect(proposed.record.provenance?.conversationId).toBe('conversation-2');
  });

  it('upgrades v3 without rewriting memory rows or dropping unknown fields', async () => {
    await createIndexedDbAtVersion(MEMORY_DATABASE_NAME, 30, (database) => {
      createStore(database, MEMORY_TABLE_NAME, memorySeedSpec(MEMORY_TABLE_SCHEMAS[3]));
    });
    await addIndexedDbRecords(MEMORY_DATABASE_NAME, MEMORY_TABLE_NAME, [legacyMemory]);

    const { db } = await import('../core/memory/store');
    await db.open();
    expect(await db.table(MEMORY_TABLE_NAME).toArray()).toEqual([legacyMemory]);
    expect(await db.table('project_context_records').count()).toBe(0);
    expect(await db.table('project_context_runs').count()).toBe(0);
    expect(await db.table('project_context_sharing').count()).toBe(0);
  });
});

function memorySeedSpec(schema: string): {
  keyPath: string;
  autoIncrement: boolean;
  indexes: readonly string[];
} {
  const [primaryKey, ...indexes] = schema.split(',').map((token) => token.trim());
  return { keyPath: primaryKey.slice(2), autoIncrement: true, indexes };
}
