export type ToolSchedulerLane = 'default' | 'known-safe' | 'heavy';
export type ToolResourceMode = 'read' | 'write';

export interface ToolExecutionResource {
  key: string;
  mode: ToolResourceMode;
}

export interface ToolExecutionScheduleRequest<T> {
  ownerKey: string;
  serverKey: string;
  lane?: ToolSchedulerLane;
  resources?: readonly ToolExecutionResource[];
  signal?: AbortSignal;
  run: () => Promise<T>;
}

export type ToolSchedulerErrorCode =
  | 'tool_scheduler_queue_full'
  | 'tool_scheduler_owner_queue_full'
  | 'tool_scheduler_wait_timeout'
  | 'tool_scheduler_cancelled';

export class ToolSchedulerError extends Error {
  readonly code: ToolSchedulerErrorCode;
  readonly retryable: boolean;

  constructor(code: ToolSchedulerErrorCode, message: string, retryable = true) {
    super(message);
    this.name = 'ToolSchedulerError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ToolExecutionSchedulerOptions {
  totalConcurrency?: number;
  ownerConcurrency?: number;
  ownerQueueLimit?: number;
  totalQueueLimit?: number;
  maxWaitMs?: number;
  laneConcurrency?: Partial<Record<ToolSchedulerLane, number>>;
}

export interface ToolExecutionScheduler {
  schedule<T>(request: ToolExecutionScheduleRequest<T>): Promise<T>;
}

interface Pending<T> extends ToolExecutionScheduleRequest<T> {
  settled: boolean;
  timer?: ReturnType<typeof setTimeout>;
  abort?: () => void;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

const defaults = {
  totalConcurrency: 8,
  ownerConcurrency: 4,
  ownerQueueLimit: 32,
  totalQueueLimit: 128,
  maxWaitMs: 30_000,
  laneConcurrency: { default: 1, 'known-safe': 4, heavy: 2 } as Record<ToolSchedulerLane, number>,
};

export function createToolExecutionScheduler(options: ToolExecutionSchedulerOptions = {}): ToolExecutionScheduler {
  const positiveInteger = (value: number | undefined, fallback: number): number => (
    Number.isInteger(value) && (value as number) > 0 ? value as number : fallback
  );
  const nonNegativeInteger = (value: number | undefined, fallback: number): number => (
    Number.isInteger(value) && (value as number) >= 0 ? value as number : fallback
  );
  const cfg = {
    totalConcurrency: positiveInteger(options.totalConcurrency, defaults.totalConcurrency),
    ownerConcurrency: positiveInteger(options.ownerConcurrency, defaults.ownerConcurrency),
    ownerQueueLimit: nonNegativeInteger(options.ownerQueueLimit, defaults.ownerQueueLimit),
    totalQueueLimit: nonNegativeInteger(options.totalQueueLimit, defaults.totalQueueLimit),
    maxWaitMs: nonNegativeInteger(options.maxWaitMs, defaults.maxWaitMs),
    laneConcurrency: { ...defaults.laneConcurrency, ...options.laneConcurrency },
  };
  for (const lane of ['default', 'known-safe', 'heavy'] as const) {
    cfg.laneConcurrency[lane] = positiveInteger(cfg.laneConcurrency[lane], defaults.laneConcurrency[lane]);
  }
  const queues = new Map<string, Pending<unknown>[]>();
  const activeOwners = new Map<string, number>();
  const activeServers = new Map<string, number>();
  const activeLanes = new Map<ToolSchedulerLane, number>();
  const activeResources = new Map<string, { reads: number; writes: number }>();
  let active = 0;
  let queued = 0;
  let cursor = 0;

  const count = (map: Map<string, number>, key: string) => map.get(key) ?? 0;
  const resourcesAvailable = (resources: readonly ToolExecutionResource[] = []) => resources.every(resource => {
    const state = activeResources.get(resource.key);
    return !state || (resource.mode === 'read' ? state.writes === 0 : state.writes === 0 && state.reads === 0);
  });
  const runnable = (item: Pending<unknown>) => active < cfg.totalConcurrency
    && count(activeOwners, item.ownerKey) < cfg.ownerConcurrency
    && count(activeServers, item.serverKey) < (item.lane === 'known-safe' ? 4 : item.lane === 'heavy' ? 2 : 1)
    && count(activeLanes, item.lane ?? 'default') < (cfg.laneConcurrency[item.lane ?? 'default'] ?? 1)
    && resourcesAvailable(item.resources);

  const release = (item: Pending<unknown>) => {
    active--;
    activeOwners.set(item.ownerKey, Math.max(0, count(activeOwners, item.ownerKey) - 1));
    activeServers.set(item.serverKey, Math.max(0, count(activeServers, item.serverKey) - 1));
    const lane = item.lane ?? 'default';
    activeLanes.set(lane, Math.max(0, count(activeLanes, lane) - 1));
    for (const resource of item.resources ?? []) {
      const state = activeResources.get(resource.key);
      if (!state) continue;
      if (resource.mode === 'read') state.reads--;
      else state.writes--;
      if (!state.reads && !state.writes) activeResources.delete(resource.key);
    }
    pump();
  };

  const start = (item: Pending<unknown>) => {
    item.settled = true;
    if (item.timer) clearTimeout(item.timer);
    item.abort?.();
    queued--;
    active++;
    activeOwners.set(item.ownerKey, count(activeOwners, item.ownerKey) + 1);
    activeServers.set(item.serverKey, count(activeServers, item.serverKey) + 1);
    const lane = item.lane ?? 'default';
    activeLanes.set(lane, count(activeLanes, lane) + 1);
    for (const resource of item.resources ?? []) {
      const state = activeResources.get(resource.key) ?? { reads: 0, writes: 0 };
      if (resource.mode === 'read') state.reads++;
      else state.writes++;
      activeResources.set(resource.key, state);
    }
    Promise.resolve().then(item.run).then(item.resolve, item.reject).finally(() => release(item));
  };

  function pump() {
    const owners = [...queues.keys()];
    if (!owners.length) return;
    for (let step = 0; step < owners.length; step++) {
      const owner = owners[(cursor + step) % owners.length];
      const queue = queues.get(owner);
      if (!queue) continue;
      const index = queue.findIndex(runnable);
      if (index < 0) continue;
      const [item] = queue.splice(index, 1);
      if (!queue.length) queues.delete(owner);
      cursor = (cursor + step + 1) % Math.max(1, owners.length);
      start(item);
      step = -1;
      if (active >= cfg.totalConcurrency) break;
    }
  }

  return {
    schedule<T>(request: ToolExecutionScheduleRequest<T>): Promise<T> {
      if (request.signal?.aborted) return Promise.reject(request.signal.reason ?? new ToolSchedulerError('tool_scheduler_cancelled', 'Tool execution cancelled'));
      if (!request.ownerKey) return Promise.reject(new ToolSchedulerError('tool_scheduler_cancelled', 'Tool execution owner is required', false));
      const ownerQueue = queues.get(request.ownerKey)?.length ?? 0;
      if (queued >= cfg.totalQueueLimit) return Promise.reject(new ToolSchedulerError('tool_scheduler_queue_full', 'Tool execution queue is full'));
      if (ownerQueue >= cfg.ownerQueueLimit) return Promise.reject(new ToolSchedulerError('tool_scheduler_owner_queue_full', 'Tool execution owner queue is full'));
      return new Promise<T>((resolve, reject) => {
        const item: Pending<T> = { ...request, settled: false, resolve, reject };
        const queue = queues.get(request.ownerKey) ?? [];
        queue.push(item as Pending<unknown>);
        queues.set(request.ownerKey, queue);
        queued++;
        item.timer = setTimeout(() => {
          if (item.settled) return;
          const current = queues.get(item.ownerKey);
          const index = current?.indexOf(item as Pending<unknown>) ?? -1;
          if (index >= 0) current!.splice(index, 1);
          if (current && !current.length) queues.delete(item.ownerKey);
          queued--;
          item.settled = true;
          item.abort?.();
          reject(new ToolSchedulerError('tool_scheduler_wait_timeout', 'Tool execution waited too long'));
          pump();
        }, cfg.maxWaitMs);
        if (request.signal) {
          item.abort = () => request.signal!.removeEventListener('abort', onAbort);
          const onAbort = () => {
            if (item.settled) return;
            const current = queues.get(item.ownerKey);
            const index = current?.indexOf(item as Pending<unknown>) ?? -1;
            if (index >= 0) current!.splice(index, 1);
            if (current && !current.length) queues.delete(item.ownerKey);
            queued--;
            item.settled = true;
            if (item.timer) clearTimeout(item.timer);
            item.abort = undefined;
            reject(request.signal!.reason ?? new ToolSchedulerError('tool_scheduler_cancelled', 'Tool execution cancelled'));
            pump();
          };
          request.signal.addEventListener('abort', onAbort, { once: true });
        }
        pump();
      });
    },
  };
}
