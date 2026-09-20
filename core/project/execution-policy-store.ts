import { createChromeStorageSlot, createVersionedRepository } from '../persistence/versioned-repository';
import { withSyncLocalStateLock } from '../persistence/local-state-lock';
import { createProjectExecutionPolicy, type ProjectExecutionPolicy, type ProjectExecutionPolicyInput } from './execution-policy';

export const PROJECT_EXECUTION_POLICY_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY = 'deepseek_pp_project_execution_policies';
interface State { schemaVersion: typeof PROJECT_EXECUTION_POLICY_SCHEMA_VERSION; policies: ProjectExecutionPolicy[] }

const repository = createVersionedRepository<State>({
  label: 'projectExecutionPolicies',
  storage: createChromeStorageSlot(STORAGE_KEY),
  createDefault: () => ({ schemaVersion: 1, policies: [] }),
  codec: {
    decode(value, path) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
      const object = value as Record<string, unknown>;
      if (object.schemaVersion !== 1 || !Array.isArray(object.policies)) throw new Error(`${path} is not a supported policy store`);
      const policies = object.policies.map((item, index) => decodePolicy(item, `${path}.policies[${index}]`));
      const projectIds = new Set<string>();
      for (const policy of policies) {
        if (projectIds.has(policy.projectId)) throw new Error(`${path} contains duplicate project policy ${policy.projectId}`);
        projectIds.add(policy.projectId);
      }
      return { schemaVersion: 1, policies };
    },
    encode(value) { return { schemaVersion: 1, policies: value.policies.map(createProjectExecutionPolicy) }; },
  },
});

export async function getProjectExecutionPolicy(projectId: string): Promise<ProjectExecutionPolicy | null> {
  return (await repository.read()).policies.find((policy) => policy.projectId === projectId) ?? null;
}

export async function saveProjectExecutionPolicy(input: ProjectExecutionPolicyInput): Promise<ProjectExecutionPolicy> {
  const policy = createProjectExecutionPolicy(input);
  return withSyncLocalStateLock(async () => {
    const state = await repository.readAlreadyLocked();
    await repository.writeAfterReadAlreadyLocked({
      ...state,
      policies: [...state.policies.filter((item) => item.projectId !== policy.projectId), policy],
    });
    return policy;
  });
}

export async function deleteProjectExecutionPolicy(projectId: string): Promise<boolean> {
  return withSyncLocalStateLock(async () => {
    const state = await repository.readAlreadyLocked();
    const policies = state.policies.filter((policy) => policy.projectId !== projectId);
    if (policies.length === state.policies.length) return false;
    await repository.writeAfterReadAlreadyLocked({ ...state, policies });
    return true;
  });
}

function decodePolicy(value: unknown, path: string): ProjectExecutionPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const object = value as Record<string, any>;
  if (object.version !== 1 || typeof object.projectId !== 'string') throw new Error(`${path} is not a supported policy`);
  if (object.mcp !== undefined && (!object.mcp || typeof object.mcp !== 'object' || Array.isArray(object.mcp))) {
    throw new Error(`${path}.mcp must be an object`);
  }
  if (object.shell !== undefined && (!object.shell || typeof object.shell !== 'object' || Array.isArray(object.shell))) {
    throw new Error(`${path}.shell must be an object`);
  }
  const mcp = object.mcp && typeof object.mcp === 'object' ? object.mcp as Record<string, unknown> : {};
  const shell = object.shell && typeof object.shell === 'object' ? object.shell as Record<string, unknown> : {};
  const names = (value: unknown, fieldPath: string): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new Error(`${fieldPath} must be an array of strings`);
    }
    return value as string[];
  };
  const toolNamesByServer: Record<string, readonly string[]> = {};
  if (mcp.toolNamesByServer && typeof mcp.toolNamesByServer === 'object') {
    for (const [id, toolNames] of Object.entries(mcp.toolNamesByServer)) {
      toolNamesByServer[id] = names(toolNames, `${path}.mcp.toolNamesByServer.${id}`);
    }
  } else if (mcp.toolNamesByServer !== undefined) {
    throw new Error(`${path}.mcp.toolNamesByServer must be an object`);
  }
  return createProjectExecutionPolicy({
    projectId: object.projectId,
    approvedRoots: names(object.approvedRoots, `${path}.approvedRoots`),
    mcp: { serverIds: names(mcp.serverIds, `${path}.mcp.serverIds`), toolNamesByServer },
    shell: { enabled: shell.enabled === true, toolNames: names(shell.toolNames, `${path}.shell.toolNames`) },
  });
}
