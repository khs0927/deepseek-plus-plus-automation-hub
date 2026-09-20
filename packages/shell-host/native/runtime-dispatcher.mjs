import { jsonRpcError } from './router.mjs';

export function createNativeEnvelopeDispatcher({
  router,
  channel,
  logger,
  hostEnvironmentReady,
}) {
  const environmentReady = Promise.resolve(hostEnvironmentReady);
  const inFlight = new Set();
  const requestControllers = new Map();
  // One FIFO per persistent shell session. Commands addressing the same
  // shell_session_* session_id share one child stdin/stdout pair and its
  // end-marker protocol, so they must keep input/output order. Everything
  // else (other sessions, one-shot shell_exec, MCP calls, file tools) runs
  // concurrently, so one chat room can never starve another.
  // Response framing stays intact: channel.writeMessage serializes stdout
  // bytes internally (framing.mjs writeTail).
  const sessionTails = new Map();

  function scheduleEnvelope(envelope) {
    if (isCancelEnvelope(envelope)) {
      cancelRequest(envelope.message.params.requestId);
      return;
    }
    const toolCall = isToolCallEnvelope(envelope);
    const sessionKey = toolCall ? shellSessionKeyOf(envelope) : null;
    const requestId = envelope?.message?.id;
    const controller = requestId === undefined || requestId === null ? null : new AbortController();
    const requestKey = requestId === undefined || requestId === null ? null : requestKeyOf(requestId);
    if (requestKey !== null) requestControllers.set(requestKey, controller);
    const run = () => handleEnvelope(envelope, toolCall, controller?.signal);
    let task;
    if (sessionKey === null) {
      task = run();
    } else {
      const tail = sessionTails.get(sessionKey) ?? Promise.resolve();
      task = tail.then(run, run);
      let tailPromise;
      tailPromise = task.then(
        () => dropSessionTail(sessionKey, tailPromise),
        () => dropSessionTail(sessionKey, tailPromise),
      );
      sessionTails.set(sessionKey, tailPromise);
    }
    inFlight.add(task);
    void task.then(
      () => finishRequest(requestKey, controller, task),
      () => finishRequest(requestKey, controller, task),
    );
  }

  function cancelRequest(requestId) {
    const key = requestKeyOf(requestId);
    const controller = requestControllers.get(key);
    if (controller && !controller.signal.aborted) {
      controller.abort(new Error(`Native request ${String(requestId)} was cancelled.`));
    }
  }

  function finishRequest(requestKey, controller, task) {
    inFlight.delete(task);
    if (requestKey !== null && requestControllers.get(requestKey) === controller) {
      requestControllers.delete(requestKey);
    }
  }

  function dropSessionTail(sessionKey, tailPromise) {
    // Delete only when nothing newer queued behind this command; a newer
    // tail means a later scheduleEnvelope already replaced the entry.
    if (sessionTails.get(sessionKey) === tailPromise) {
      sessionTails.delete(sessionKey);
    }
  }

  function shellSessionKeyOf(envelope) {
    const params = envelope?.message?.params;
    if (!params || typeof params !== 'object') return null;
    if (params.name !== 'shell_session_exec' && params.name !== 'shell_session_end') return null;
    const sessionId = params.arguments?.session_id;
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) return null;
    return `shell-session:${sessionId}`;
  }

  async function handleEnvelope(envelope, waitForHostEnvironment, signal) {
    try {
      if (waitForHostEnvironment) await environmentReady;
      const response = await router.handleEnvelope(envelope, { signal });
      if (response) await channel.writeMessage(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.logLine(`Error: ${message}`);
      // Reply with the request's own id when available: the extension matches
      // native responses by id, and an id:null error for a valid request would
      // otherwise hang until the request timeout instead of failing fast.
      const requestId = envelope?.message?.id ?? null;
      await channel.writeMessage(jsonRpcError(requestId, -32603, message || 'Internal error'));
    }
  }

  return Object.freeze({
    scheduleEnvelope,
    async settle() {
      await Promise.allSettled([...inFlight]);
    },
  });
}

function isCancelEnvelope(envelope) {
  return envelope?.protocol === 'deepseek-pp-mcp-native'
    && envelope?.version === 1
    && envelope?.message?.jsonrpc === '2.0'
    && envelope?.message?.method === '$/cancelRequest'
    && envelope?.message?.params
    && Object.prototype.hasOwnProperty.call(envelope.message.params, 'requestId');
}

function requestKeyOf(requestId) {
  return `${typeof requestId}:${String(requestId)}`;
}

function isToolCallEnvelope(envelope) {
  return envelope?.protocol === 'deepseek-pp-mcp-native'
    && envelope?.version === 1
    && envelope?.message?.jsonrpc === '2.0'
    && envelope?.message?.method === 'tools/call';
}
