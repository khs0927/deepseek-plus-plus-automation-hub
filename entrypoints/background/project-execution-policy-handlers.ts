import type { RuntimeMessageContext } from '../../core/messaging/runtime-boundary';
import type { RuntimeCommandHandler } from '../../core/messaging/runtime-command-registry';
import {
  deleteProjectExecutionPolicy,
  getProjectExecutionPolicy,
  saveProjectExecutionPolicy,
} from '../../core/project/execution-policy-store';
import {
  defineProjectExecutionPolicyPayloadRuntimeCommandHandler,
} from './runtime-handler';

export interface ProjectExecutionPolicyRuntimeHandlerDependencies {
  getProjectContextState(): Promise<{ projects: readonly { id: string }[] }>;
}

export function createProjectExecutionPolicyHandlers(
  dependencies: ProjectExecutionPolicyRuntimeHandlerDependencies,
): readonly RuntimeCommandHandler[] {
  return Object.freeze([
    defineProjectExecutionPolicyPayloadRuntimeCommandHandler('GET_PROJECT_EXECUTION_POLICY', async (payload, context) => {
      assertExtensionSurface(context);
      await assertProject(payload.projectId, dependencies);
      return getProjectExecutionPolicy(payload.projectId);
    }),
    defineProjectExecutionPolicyPayloadRuntimeCommandHandler('SAVE_PROJECT_EXECUTION_POLICY', async (payload, context) => {
      assertExtensionSurface(context);
      await assertProject(payload.projectId, dependencies);
      return saveProjectExecutionPolicy(payload);
    }),
    defineProjectExecutionPolicyPayloadRuntimeCommandHandler('DELETE_PROJECT_EXECUTION_POLICY', async (payload, context) => {
      assertExtensionSurface(context);
      await assertProject(payload.projectId, dependencies);
      await deleteProjectExecutionPolicy(payload.projectId);
      return { ok: true as const };
    }),
  ]);
}

function assertExtensionSurface(context: RuntimeMessageContext): void {
  if (context.surface !== 'extension_context') {
    throw new Error('Project execution policy requires an extension UI sender.');
  }
}

async function assertProject(
  projectId: string,
  dependencies: ProjectExecutionPolicyRuntimeHandlerDependencies,
): Promise<void> {
  const state = await dependencies.getProjectContextState();
  if (!state.projects.some((project) => project.id === projectId)) {
    throw new Error('Project execution policy project was not found.');
  }
}
