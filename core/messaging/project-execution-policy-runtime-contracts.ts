import type { MessageAction } from '../types';
import type { ProjectExecutionPolicy, ProjectExecutionPolicyInput } from '../project/execution-policy';

type DeclaredRuntimeRequest<TType extends MessageAction['type']> = Extract<
  MessageAction,
  { type: TType }
>;

export interface ProjectExecutionPolicyRuntimeCommandContracts {
  GET_PROJECT_EXECUTION_POLICY: {
    request: DeclaredRuntimeRequest<'GET_PROJECT_EXECUTION_POLICY'>;
    response: ProjectExecutionPolicy | null;
  };
  SAVE_PROJECT_EXECUTION_POLICY: {
    request: DeclaredRuntimeRequest<'SAVE_PROJECT_EXECUTION_POLICY'>;
    response: ProjectExecutionPolicy;
  };
  DELETE_PROJECT_EXECUTION_POLICY: {
    request: DeclaredRuntimeRequest<'DELETE_PROJECT_EXECUTION_POLICY'>;
    response: { ok: true };
  };
}

export type ProjectExecutionPolicySaveInput = Omit<ProjectExecutionPolicyInput, 'projectId'> & {
  projectId: string;
};
