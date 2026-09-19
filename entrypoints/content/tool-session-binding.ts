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
  // `undefined` means there is no local grant for this call, not a new-chat
  // grant awaiting route binding. Preserve the normal authorization rejection
  // path instead of introducing a binding delay.
  if (authorizationChatSessionId === undefined) return call;
  if (!call.source) return null;

  const authorizedChatSessionId = normalizeChatSessionId(authorizationChatSessionId);
  if (authorizedChatSessionId) {
    if (call.source.chatSessionId === authorizedChatSessionId) return call;
    return {
      ...call,
      source: {
        ...call.source,
        chatSessionId: authorizedChatSessionId,
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

function normalizeChatSessionId(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
