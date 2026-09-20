import type {
  RuntimeMessageContext,
} from '../../core/messaging/runtime-boundary';
import {
  decodeBackgroundRuntimePayload,
  type BackgroundRuntimeDecodedPayload,
  type BackgroundRuntimePayloadCommandType,
} from '../../core/messaging/background-runtime-request-codec';
import {
  decodeDeepSeekRuntimePayload,
  type DeepSeekRuntimeDecodedPayload,
  type DeepSeekRuntimePayloadCommandType,
} from '../../core/messaging/deepseek-runtime-request-codec';
import {
  decodePersistenceRuntimePayload,
  type PersistencePayloadCommandType,
  type PersistenceRuntimePayload,
} from '../../core/messaging/persistence-runtime-request-codec';
import {
  decodeProjectKnowledgeRuntimePayload,
  type ProjectKnowledgeRuntimePayload,
} from '../../core/messaging/project-knowledge-runtime-request-codec';
export type { ProjectKnowledgeRuntimePayload } from '../../core/messaging/project-knowledge-runtime-request-codec';
import type { ProjectKnowledgeRuntimeCommandContracts } from '../../core/messaging/project-knowledge-runtime-contracts';
import {
  decodeProjectExecutionPolicyRuntimePayload,
  type ProjectExecutionPolicyRuntimePayload,
} from '../../core/messaging/project-execution-policy-runtime-request-codec';
import {
  decodeToolRuntimePayload,
  type ToolRuntimeDecodedPayload,
  type ToolRuntimePayloadCommandType,
} from '../../core/messaging/tool-runtime-request-codec';
import {
  defineRuntimeCommandHandler,
  type RuntimeCommandHandler,
  type TypedRuntimeCommandResponse,
  type TypedRuntimeCommandType,
} from '../../core/messaging/runtime-command-registry';

type MaybePromise<T> = T | Promise<T>;

type PersistenceTypedCommandType = PersistencePayloadCommandType & TypedRuntimeCommandType;
type ToolTypedCommandType = ToolRuntimePayloadCommandType & TypedRuntimeCommandType;
type DeepSeekTypedCommandType = DeepSeekRuntimePayloadCommandType & TypedRuntimeCommandType;
type BackgroundTypedCommandType = BackgroundRuntimePayloadCommandType & TypedRuntimeCommandType;
type ProjectKnowledgePayloadCommandType = keyof ProjectKnowledgeRuntimeCommandContracts;
type ProjectExecutionPolicyPayloadCommandType = 'GET_PROJECT_EXECUTION_POLICY' | 'SAVE_PROJECT_EXECUTION_POLICY' | 'DELETE_PROJECT_EXECUTION_POLICY';

export function defineBackgroundPayloadRuntimeCommandHandler<
  TType extends BackgroundTypedCommandType,
>(
  type: TType,
  handle: (
    payload: BackgroundRuntimeDecodedPayload<TType>,
    context: RuntimeMessageContext,
  ) => MaybePromise<TypedRuntimeCommandResponse<TType>>,
): RuntimeCommandHandler<TType> {
  return defineRuntimeCommandHandler<TType, BackgroundRuntimeDecodedPayload<TType>>({
    type,
    decode(message) {
      const payload = Object.hasOwn(message, 'payload') ? message.payload : undefined;
      return decodeBackgroundRuntimePayload(type, payload);
    },
    handle,
  });
}

export function defineDeepSeekPayloadRuntimeCommandHandler<
  TType extends DeepSeekTypedCommandType,
>(
  type: TType,
  handle: (
    payload: DeepSeekRuntimeDecodedPayload<TType>,
    context: RuntimeMessageContext,
  ) => MaybePromise<TypedRuntimeCommandResponse<TType>>,
): RuntimeCommandHandler<TType> {
  return defineRuntimeCommandHandler<TType, DeepSeekRuntimeDecodedPayload<TType>>({
    type,
    decode(message) {
      const payload = Object.hasOwn(message, 'payload') ? message.payload : undefined;
      return decodeDeepSeekRuntimePayload(type, payload);
    },
    handle,
  });
}

export function definePersistencePayloadRuntimeCommandHandler<
  TType extends PersistenceTypedCommandType,
>(
  type: TType,
  handle: (
    payload: PersistenceRuntimePayload<TType>,
    context: RuntimeMessageContext,
  ) => MaybePromise<TypedRuntimeCommandResponse<TType>>,
): RuntimeCommandHandler<TType> {
  return defineRuntimeCommandHandler<TType, PersistenceRuntimePayload<TType>>({
    type,
    decode(message) {
      const payload = Object.hasOwn(message, 'payload') ? message.payload : undefined;
      return decodePersistenceRuntimePayload(type, payload);
    },
    handle,
  });
}

export function defineProjectKnowledgePayloadRuntimeCommandHandler<
  TType extends ProjectKnowledgePayloadCommandType & TypedRuntimeCommandType,
>(
  type: TType,
  handle: (
    payload: ProjectKnowledgeRuntimePayload<TType>,
    context: RuntimeMessageContext,
  ) => MaybePromise<TypedRuntimeCommandResponse<TType>>,
): RuntimeCommandHandler<TType> {
  return defineRuntimeCommandHandler<TType, ProjectKnowledgeRuntimePayload<TType>>({
    type,
    decode(message) {
      const payload = Object.hasOwn(message, 'payload') ? message.payload : undefined;
      return decodeProjectKnowledgeRuntimePayload(type, payload);
    },
    handle,
  });
}

export function defineProjectExecutionPolicyPayloadRuntimeCommandHandler<
  TType extends ProjectExecutionPolicyPayloadCommandType & TypedRuntimeCommandType,
>(
  type: TType,
  handle: (
    payload: ProjectExecutionPolicyRuntimePayload<TType>,
    context: RuntimeMessageContext,
  ) => MaybePromise<TypedRuntimeCommandResponse<TType>>,
): RuntimeCommandHandler<TType> {
  return defineRuntimeCommandHandler<TType, ProjectExecutionPolicyRuntimePayload<TType>>({
    type,
    decode(message) {
      const payload = Object.hasOwn(message, 'payload') ? message.payload : undefined;
      return decodeProjectExecutionPolicyRuntimePayload(type, payload);
    },
    handle,
  });
}

export function defineToolPayloadRuntimeCommandHandler<
  TType extends ToolTypedCommandType,
>(
  type: TType,
  handle: (
    payload: ToolRuntimeDecodedPayload<TType>,
    context: RuntimeMessageContext,
  ) => MaybePromise<TypedRuntimeCommandResponse<TType>>,
): RuntimeCommandHandler<TType> {
  return defineRuntimeCommandHandler<TType, ToolRuntimeDecodedPayload<TType>>({
    type,
    decode(message) {
      const payload = Object.hasOwn(message, 'payload') ? message.payload : undefined;
      return decodeToolRuntimePayload(type, payload);
    },
    handle,
  });
}
