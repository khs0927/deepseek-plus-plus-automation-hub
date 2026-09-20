const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

class RequestTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Subagent network request exceeded ${timeoutMs} ms.`);
    this.name = 'RequestTimeoutError';
    this.code = 'subagent_request_timeout';
  }
}

class ResponseTooLargeError extends Error {
  constructor(maxBytes) {
    super(`Subagent response exceeded ${maxBytes} bytes.`);
    this.name = 'ResponseTooLargeError';
    this.code = 'subagent_response_too_large';
  }
}

function fetchWithDeadline(input, init = {}, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Subagent request timeout must be positive.'));
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    return Promise.reject(new Error('Subagent response maxBytes must be positive.'));
  }

  const callerSignal = options.signal || init.signal;
  if (callerSignal?.aborted) return Promise.reject(abortError(callerSignal.reason));

  const controller = new AbortController();
  let timedOut = false;
  let cleaned = false;
  const abortFromCaller = () => controller.abort(callerSignal.reason);
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new RequestTimeoutError(timeoutMs));
  }, timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  };

  return fetch(input, { ...init, signal: controller.signal })
    .then(response => {
      if (!response.body) {
        cleanup();
        return response;
      }
      return wrapResponse(response, cleanup, () => timedOut, timeoutMs, deadline, maxBytes);
    })
    .catch(error => {
      cleanup();
      if (callerSignal?.aborted) throw abortError(callerSignal.reason);
      if (timedOut) throw new RequestTimeoutError(timeoutMs);
      throw error;
    });
}

async function readResponseText(response, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError(maxBytes);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock?.();
  }
}

async function readResponseJson(response, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const text = await readResponseText(response, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Subagent response was not valid JSON.');
  }
}

function wrapResponse(response, cleanup, timedOut, timeoutMs, deadline, maxBytes) {
  const reader = response.body.getReader();
  let total = 0;
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const chunk = await readChunkWithDeadline(reader, deadline, timeoutMs);
        if (chunk.done) {
          cleanup();
          controller.close();
          return;
        }
        total += chunk.value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          cleanup();
          controller.error(new ResponseTooLargeError(maxBytes));
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        cleanup();
        controller.error(timedOut() ? new RequestTimeoutError(timeoutMs) : error);
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

async function readChunkWithDeadline(reader, deadline, timeoutMs) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    void reader.cancel();
    throw new RequestTimeoutError(timeoutMs);
  }
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel();
      reject(new RequestTimeoutError(timeoutMs));
    }, remaining);
  });
  try {
    return await Promise.race([reader.read(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function abortError(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error('Subagent request was aborted.');
  error.name = 'AbortError';
  return error;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BODY_BYTES,
  RequestTimeoutError,
  ResponseTooLargeError,
  fetchWithDeadline,
  readResponseText,
  readResponseJson,
};
