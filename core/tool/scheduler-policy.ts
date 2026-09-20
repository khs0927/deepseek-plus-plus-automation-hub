import type { ToolCall, ToolDescriptor } from './types';
import type { ToolExecutionResource, ToolSchedulerLane } from './scheduler';

export function classifyToolExecution(descriptor: ToolDescriptor, call: ToolCall): {
  lane: ToolSchedulerLane;
  resources: ToolExecutionResource[];
} {
  const annotation = descriptor.annotations?.schedulerLane ?? descriptor.annotations?.['scheduler-lane'];
  const read = descriptor.annotations?.operation === 'read'
    || descriptor.annotations?.readOnly === 'true'
    || descriptor.annotations?.['read-only'] === 'true'
    || /(^|[_:-])(read|search|list|lookup|stat|describe|fetch|get)([_:-]|$)/i.test(call.name)
      && !/(write|delete|remove|update|create|send|execute|run|apply|patch)/i.test(call.name);
  const lane: ToolSchedulerLane = annotation === 'known-safe' || annotation === 'heavy' || annotation === 'default'
    ? annotation
    : descriptor.execution.risk === 'high' ? 'heavy' : read ? 'known-safe' : 'default';
  const server = `${descriptor.provider.kind}:${descriptor.provider.id}`;
  const resources: ToolExecutionResource[] = [{ key: `server:${server}`, mode: read ? 'read' : 'write' }];
  const paths = [
    call.payload.path,
    call.payload.cwd,
    call.payload.rootPath,
    call.payload.directory,
    call.payload.working_directory,
    call.payload.workdir,
  ];
  for (const value of paths) {
    if (typeof value !== 'string' || !value.trim()) continue;
    for (const key of pathResourceKeys(value)) resources.push({ key, mode: read ? 'read' : 'write' });
  }
  const payloadPaths = call.payload.paths;
  if (Array.isArray(payloadPaths)) {
    for (const value of payloadPaths) {
      if (typeof value !== 'string' || !value.trim()) continue;
      for (const key of pathResourceKeys(value)) resources.push({ key, mode: read ? 'read' : 'write' });
    }
  }
  const sessionId = call.payload.session_id;
  if (typeof sessionId === 'string' && sessionId.trim()) {
    resources.push({ key: `shell-session:${sessionId.trim()}`, mode: 'write' });
  }
  return {
    lane,
    resources: dedupeResources(resources),
  };
}

function dedupeResources(resources: readonly ToolExecutionResource[]): ToolExecutionResource[] {
  const byKey = new Map<string, ToolExecutionResource>();
  for (const resource of resources) {
    const existing = byKey.get(resource.key);
    if (!existing || resource.mode === 'write') byKey.set(resource.key, resource);
  }
  return [...byKey.values()];
}

function pathResourceKeys(value: string): string[] {
  const input = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!input) return [];
  const drive = /^[a-zA-Z]:\//.test(input) ? input.slice(0, 3) : input.startsWith('/') ? '/' : '';
  const body = drive === '/' ? input.slice(1) : drive ? input.slice(3) : input;
  const parts = body.split('/');
  const normalizedParts: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      normalizedParts.pop();
      continue;
    }
    normalizedParts.push(part);
  }
  const normalized = `${drive}${normalizedParts.join('/')}`.replace(/\/$/, '');
  if (!normalized) return drive ? [`path:${drive.toLowerCase()}`] : [];
  const canonicalParts = drive === '/' ? normalized.slice(1).split('/') : drive ? normalized.slice(3).split('/') : normalized.split('/');
  const keys: string[] = [];
  for (let index = 1; index <= canonicalParts.length; index += 1) {
    const prefix = `${drive}${canonicalParts.slice(0, index).join('/')}`;
    keys.push(`path:${prefix.toLowerCase()}`);
  }
  return keys;
}
