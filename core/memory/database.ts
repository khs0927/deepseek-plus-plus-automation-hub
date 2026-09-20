import { IndexedDb } from '../persistence/indexeddb';
import {
  MEMORY_DATABASE_NAME,
  MEMORY_DATABASE_VERSION,
  MEMORY_TABLE_NAME,
  MEMORY_TABLE_SCHEMAS,
  PROJECT_CONTEXT_RECORDS_TABLE_NAME,
  PROJECT_CONTEXT_RECORDS_TABLE_SCHEMA,
  PROJECT_CONTEXT_RUNS_TABLE_NAME,
  PROJECT_CONTEXT_RUNS_TABLE_SCHEMA,
  PROJECT_CONTEXT_SHARING_TABLE_NAME,
  PROJECT_CONTEXT_SHARING_TABLE_SCHEMA,
  migrateMemoryV1RecordToV2,
  migrateMemoryV2RecordToV3,
} from './schema';

/** Shared IndexedDB authority for Memory and project conversation context. */
export const db = new IndexedDb(MEMORY_DATABASE_NAME, [
  {
    version: 10,
    stores: { [MEMORY_TABLE_NAME]: MEMORY_TABLE_SCHEMAS[1] },
  },
  {
    version: 20,
    stores: { [MEMORY_TABLE_NAME]: MEMORY_TABLE_SCHEMAS[2] },
    migrate: (tx) => tx.table(MEMORY_TABLE_NAME).modifyAll((memory) => {
      Object.assign(memory, migrateMemoryV1RecordToV2(memory, crypto.randomUUID()));
    }),
  },
  {
    version: 30,
    stores: { [MEMORY_TABLE_NAME]: MEMORY_TABLE_SCHEMAS[3] },
    migrate: (tx) => tx.table(MEMORY_TABLE_NAME).modifyAll((memory) => {
      Object.assign(memory, migrateMemoryV2RecordToV3(memory));
      delete memory.projectId;
    }),
  },
  {
    version: 40,
    stores: {
      [MEMORY_TABLE_NAME]: MEMORY_TABLE_SCHEMAS[4],
      [PROJECT_CONTEXT_RECORDS_TABLE_NAME]: PROJECT_CONTEXT_RECORDS_TABLE_SCHEMA,
      [PROJECT_CONTEXT_RUNS_TABLE_NAME]: PROJECT_CONTEXT_RUNS_TABLE_SCHEMA,
      [PROJECT_CONTEXT_SHARING_TABLE_NAME]: PROJECT_CONTEXT_SHARING_TABLE_SCHEMA,
    },
  },
]);

export async function assertCurrentMemoryDatabaseVersion(): Promise<void> {
  await db.open();
  const actualVersion = db.backendDB().version;
  const expectedVersion = MEMORY_DATABASE_VERSION * 10;
  const hasProjectContextStores = [
    PROJECT_CONTEXT_RECORDS_TABLE_NAME,
    PROJECT_CONTEXT_RUNS_TABLE_NAME,
    PROJECT_CONTEXT_SHARING_TABLE_NAME,
  ].every((name) => db.backendDB().objectStoreNames.contains(name));
  if (actualVersion !== expectedVersion || !hasProjectContextStores) {
    throw new Error(
      `Memory database version ${actualVersion / 10} is not supported by version ${MEMORY_DATABASE_VERSION}`,
    );
  }
}
