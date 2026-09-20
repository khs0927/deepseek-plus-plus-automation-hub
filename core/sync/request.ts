import { createAbortScope } from '../network/abort';

export const DEFAULT_SYNC_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_SYNC_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;

export interface SyncRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
}

export class SyncRequestTimeoutError extends Error {
  readonly code = 'sync_request_timeout' as const;

  constructor(timeoutMs: number) {
    super(`Sync request exceeded ${timeoutMs} ms.`);
    this.name = 'SyncRequestTimeoutError';
  }
}

export class SyncResponseTooLargeError extends Error {
  readonly code = 'sync_response_too_large' as const;

  constructor(maxBytes: number) {
    super(`Sync response exceeded ${maxBytes} bytes.`);
    this.name = 'SyncResponseTooLargeError';
  }
}

/**
 * Fetch with one bounded deadline that remains active while the response body
 * is consumed. The caller's AbortSignal is preserved and always wins over the
 * local timeout.
 */
export async function fetchWithSyncTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: SyncRequestOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SYNC_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Sync request timeout must be a positive finite number.');
  }
  const maxBytes = options.maxBytes ?? DEFAULT_SYNC_RESPONSE_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('Sync response maxBytes must be a positive safe integer.');
  }

  const callerSignal = options.signal ?? init.signal ?? undefined;
  if (callerSignal?.aborted) throwSignalReason(callerSignal);

  const abortScope = createAbortScope(callerSignal, timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let responseReturned = false;
  try {
    const response = await fetch(input, {
      ...init,
      signal: abortScope.signal,
    });
    responseReturned = true;
    if (!response.body) {
      abortScope.clearDeadline();
      abortScope.cleanup();
      return response;
    }
    return wrapResponseBody(response, abortScope, timeoutMs, deadline, maxBytes);
  } catch (error) {
    if (callerSignal?.aborted) throwSignalReason(callerSignal);
    if (abortScope.timedOut()) throw new SyncRequestTimeoutError(timeoutMs);
    throw error;
  } finally {
    if (!responseReturned) abortScope.cleanup();
  }
}

function wrapResponseBody(
  response: Response,
  abortScope: ReturnType<typeof createAbortScope>,
  timeoutMs: number,
  deadline: number,
  maxBytes: number,
): Response {
  const reader = response.body!.getReader();
  let totalBytes = 0;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    abortScope.clearDeadline();
    abortScope.cleanup();
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await readChunkWithDeadline(reader, deadline, timeoutMs);
        if (chunk.done) {
          cleanup();
          controller.close();
          return;
        }
        totalBytes += chunk.value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          cleanup();
          controller.error(new SyncResponseTooLargeError(maxBytes));
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        cleanup();
        if (abortScope.timedOut()) {
          controller.error(new SyncRequestTimeoutError(
            timeoutMs,
          ));
          return;
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      await reader.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function readChunkWithDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadline: number,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    void reader.cancel();
    throw new SyncRequestTimeoutError(timeoutMs);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel();
      reject(new SyncRequestTimeoutError(timeoutMs));
    }, remaining);
  });
  try {
    return await Promise.race([reader.read(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function throwSignalReason(signal: AbortSignal): never {
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Sync request was aborted.', 'AbortError');
}
