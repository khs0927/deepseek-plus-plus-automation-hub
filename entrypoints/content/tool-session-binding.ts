import type { ToolCall } from '../../core/types';

export const TOOL_SESSION_BINDING_TIMEOUT_MS = 5_000;
const CONTENT_NAVIGATION_EVENT = 'dpp:navigation';

interface ToolSessionBindingOptions {
  readonly readChatSessionId: () => string | null;
  readonly target?: EventTarget;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/**
 * Bind a tool call to the session captured by the extension-owned grant.
 *
 * The call may have been produced from a page/model stream that still carries
 * the request body's session claim. That claim is not authorization evidence
 * and can be stale after a same-document navigation. Once a grant is already
 * bound, normalize the call to the grant's session instead of forwarding the
 * stale claim. A null grant is valid only while a new chat is awaiting its
 * browser-owned route.
 */
export async function bindNewChatToolCallToBrowserSession(
  call: ToolCall,
  authorizationChatSessionId: string | null | undefined,
  options: ToolSessionBindingOptions,
): Promise<ToolCall | null> {
  if (!call.source) return null;

  if (authorizationChatSessionId !== null && authorizationChatSessionId !== undefined) {
    if (call.source.chatSessionId === authorizationChatSessionId) return call;
    return {
      ...call,
      source: {
        ...call.source,
        chatSessionId: authorizationChatSessionId,
      },
    };
  }

  const chatSessionId = await waitForBrowserOwnedChatSession(options);
  if (!chatSessionId) return null;
  return {
    ...call,
    source: {
      ...call.source,
      chatSessionId,
    },
  };
}

export function waitForBrowserOwnedChatSession(
  options: ToolSessionBindingOptions,
): Promise<string | null> {
  const existing = options.readChatSessionId();
  if (existing) return Promise.resolve(existing);
  if (options.signal?.aborted) return Promise.resolve(null);

  const target = options.target ?? window;
  const timeoutMs = options.timeoutMs ?? TOOL_SESSION_BINDING_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (sessionId: string | null) => {
      if (settled) return;
      settled = true;
      target.removeEventListener(CONTENT_NAVIGATION_EVENT, onNavigation);
      options.signal?.removeEventListener('abort', onAbort);
      if (timer !== null) clearTimeout(timer);
      resolve(sessionId);
    };
    const onNavigation = () => {
      const sessionId = options.readChatSessionId();
      if (sessionId) finish(sessionId);
    };
    const onAbort = () => finish(null);

    target.addEventListener(CONTENT_NAVIGATION_EVENT, onNavigation);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(null), timeoutMs);
    onNavigation();
  });
}
