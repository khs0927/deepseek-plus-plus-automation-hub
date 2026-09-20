import type { ProjectExecutionPolicyRuntimeCommandContracts } from './project-execution-policy-runtime-contracts';
import { isPlainRuntimeRecord } from './runtime-boundary';

type CommandType = keyof ProjectExecutionPolicyRuntimeCommandContracts;
type PayloadCommandType = {
  [TType in CommandType]:
    'payload' extends keyof ProjectExecutionPolicyRuntimeCommandContracts[TType]['request'] ? TType : never;
}[CommandType];
export type ProjectExecutionPolicyRuntimePayload<TType extends PayloadCommandType> =
  ProjectExecutionPolicyRuntimeCommandContracts[TType]['request'] extends { payload: infer TPayload }
    ? TPayload
    : never;

type DecoderMap = {
  [TType in PayloadCommandType]: (value: unknown) => ProjectExecutionPolicyRuntimePayload<TType>;
};

export const PROJECT_EXECUTION_POLICY_RUNTIME_PAYLOAD_DECODERS: DecoderMap = {
  GET_PROJECT_EXECUTION_POLICY(value) {
    const payload = record(value, 'GET_PROJECT_EXECUTION_POLICY.payload');
    nonEmpty(payload.projectId, 'GET_PROJECT_EXECUTION_POLICY.payload.projectId');
    return payload as ProjectExecutionPolicyRuntimePayload<'GET_PROJECT_EXECUTION_POLICY'>;
  },
  SAVE_PROJECT_EXECUTION_POLICY(value) {
    const payload = record(value, 'SAVE_PROJECT_EXECUTION_POLICY.payload');
    nonEmpty(payload.projectId, 'SAVE_PROJECT_EXECUTION_POLICY.payload.projectId');
    stringArray(payload.approvedRoots, 'SAVE_PROJECT_EXECUTION_POLICY.payload.approvedRoots');
    const mcp = record(payload.mcp, 'SAVE_PROJECT_EXECUTION_POLICY.payload.mcp');
    stringArray(mcp.serverIds, 'SAVE_PROJECT_EXECUTION_POLICY.payload.mcp.serverIds');
    const toolNamesByServer = record(
      mcp.toolNamesByServer,
      'SAVE_PROJECT_EXECUTION_POLICY.payload.mcp.toolNamesByServer',
    );
    for (const [serverId, names] of Object.entries(toolNamesByServer)) {
      stringArray(names, `SAVE_PROJECT_EXECUTION_POLICY.payload.mcp.toolNamesByServer.${serverId}`);
    }
    const shell = record(payload.shell, 'SAVE_PROJECT_EXECUTION_POLICY.payload.shell');
    if (typeof shell.enabled !== 'boolean') throw new Error('SAVE_PROJECT_EXECUTION_POLICY.payload.shell.enabled must be boolean');
    stringArray(shell.toolNames, 'SAVE_PROJECT_EXECUTION_POLICY.payload.shell.toolNames');
    return payload as ProjectExecutionPolicyRuntimePayload<'SAVE_PROJECT_EXECUTION_POLICY'>;
  },
  DELETE_PROJECT_EXECUTION_POLICY(value) {
    const payload = record(value, 'DELETE_PROJECT_EXECUTION_POLICY.payload');
    nonEmpty(payload.projectId, 'DELETE_PROJECT_EXECUTION_POLICY.payload.projectId');
    return payload as ProjectExecutionPolicyRuntimePayload<'DELETE_PROJECT_EXECUTION_POLICY'>;
  },
};

export function decodeProjectExecutionPolicyRuntimePayload<TType extends PayloadCommandType>(
  type: TType,
  value: unknown,
): ProjectExecutionPolicyRuntimePayload<TType> {
  return PROJECT_EXECUTION_POLICY_RUNTIME_PAYLOAD_DECODERS[type](value);
}

function record(value: unknown, path: string): Record<string, any> {
  if (!isPlainRuntimeRecord(value)) throw new Error(`${path} must be a plain object`);
  return value;
}
function nonEmpty(value: unknown, path: string): void {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`);
}
function stringArray(value: unknown, path: string): void {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${path} must be an array of strings`);
  }
}
