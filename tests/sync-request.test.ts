import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithSyncTimeout,
  SyncRequestTimeoutError,
  SyncResponseTooLargeError,
} from '../core/sync/request';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sync network request sidecar', () => {
  it('aborts a hanging fetch at the configured deadline', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    }));

    await expect(fetchWithSyncTimeout('https://sync.example.test', {}, { timeoutMs: 5 }))
      .rejects.toBeInstanceOf(SyncRequestTimeoutError);
    expect(signal?.aborted).toBe(true);
  });

  it('propagates caller cancellation instead of converting it to timeout', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      })
    )));

    const request = fetchWithSyncTimeout('https://sync.example.test', {}, { timeoutMs: 1_000, signal: controller.signal });
    controller.abort(new Error('caller stopped sync'));
    await expect(request).rejects.toThrow('caller stopped sync');
  });

  it('caps streamed response bodies before returning unbounded text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('12345')));

    const response = await fetchWithSyncTimeout(
      'https://sync.example.test',
      {},
      { maxBytes: 4 },
    );
    await expect(response.text()).rejects.toBeInstanceOf(SyncResponseTooLargeError);
  });

});
