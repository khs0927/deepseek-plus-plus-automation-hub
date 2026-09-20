const {
  fetchWithDeadline,
  readResponseJson,
} = require('./request-helper');

const CDP_FETCH_TIMEOUT_MS = 15_000;
const CDP_COMMAND_TIMEOUT_MS = 20_000;
const WORKER_TIMEOUT_MS = 180_000;

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('DeepSeek web worker was cancelled.');
  error.name = 'AbortError';
  throw error;
}

async function runDeepSeekWebWorker({
  role,
  task,
  cdpUrl = 'http://127.0.0.1:9223',
  timeoutMs = WORKER_TIMEOUT_MS,
  maxContinuations = 3,
  signal,
}) {
  let tabId = null;
  let ws = null;
  let closeUrl = null;
  const deadline = Date.now() + timeoutMs;

  try {
    throwIfAborted(signal);
    const newTabRes = await fetchWithDeadline(
      `${cdpUrl}/json/new?${encodeURIComponent('https://chat.deepseek.com')}`,
      { method: 'PUT' },
      { signal, timeoutMs: CDP_FETCH_TIMEOUT_MS, maxBytes: 256 * 1024 },
    );
    if (!newTabRes.ok) {
      throw new Error(`Failed to open Edge tab via CDP (${newTabRes.status}).`);
    }
    const tab = await readResponseJson(newTabRes, 256 * 1024);
    if (!tab || typeof tab.id !== 'string' || typeof tab.webSocketDebuggerUrl !== 'string') {
      throw new Error('Edge CDP returned an invalid tab descriptor.');
    }
    tabId = tab.id;
    closeUrl = `${cdpUrl}/json/close/${encodeURIComponent(tabId)}`;

    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await waitForWebSocket(ws, signal, Math.min(10_000, remaining(deadline)));

    let nextCommandId = 1;
    const sendCDP = (method, params = {}) => sendCdpCommand(
      ws,
      () => nextCommandId++,
      method,
      params,
      signal,
      Math.min(CDP_COMMAND_TIMEOUT_MS, remaining(deadline)),
    );

    let ready = false;
    for (let i = 0; i < 25 && remaining(deadline) > 0; i += 1) {
      await delayWithSignal(1_000, signal);
      const check = await sendCDP('Runtime.evaluate', {
        returnByValue: true,
        expression: '!!document.querySelector("textarea")',
      });
      if (check?.result?.value) {
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error('DeepSeek web page did not load its textarea in time.');

    const fullPrompt = [
      `[시스템 역할 위임: 당신은 '${role}' 역할을 전담하는 독립적인 전문 서브에이전트입니다.]`,
      '아래 작업을 분석하고 구체적이며 전문적인 결과 보고서를 작성하세요.',
      '',
      '---',
      '[작업 지시사항]',
      task,
      '---',
    ].join('\n');

    const sendPrompt = text => sendCDP('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const ta = document.querySelector('textarea');
        if (!ta) return { success: false, reason: 'no textarea' };
        ta.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${JSON.stringify(text)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        let parent = ta.parentElement;
        while (parent && !parent.querySelector('div[role="button"], button')) parent = parent.parentElement;
        const buttons = parent ? Array.from(parent.querySelectorAll('div[role="button"], button')) : [];
        const send = buttons.reverse().find(button => !button.hasAttribute('aria-disabled') && !button.disabled && (button.className.includes('primary') || button.className.includes('filled') || button.querySelector('svg')));
        if (!send) return { success: false, reason: 'send button not found' };
        send.click();
        return { success: true };
      })()`,
    });

    throwIfAborted(signal);
    const injected = await sendPrompt(fullPrompt);
    if (!injected?.result?.value?.success) {
      throw new Error(`Failed to submit prompt to DeepSeek: ${injected?.result?.value?.reason || 'unknown reason'}`);
    }

    let finalAnswer = '';
    let lastLength = 0;
    let stableCount = 0;
    let continuationCount = 0;
    let lastChangeTime = Date.now();

    await delayWithSignal(2_000, signal);
    while (remaining(deadline) > 0) {
      await delayWithSignal(1_200, signal);
      const poll = await sendCDP('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const markdowns = Array.from(document.querySelectorAll('.ds-markdown'));
          if (markdowns.length === 0) return { exists: false, generating: true, text: '' };
          const last = markdowns[markdowns.length - 1];
          const stop = document.querySelector('div[role="button"][aria-label*="중지"], div[role="button"][aria-label*="Stop"], .ds-icon-button[aria-label*="stop"]');
          const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          const resume = buttons.find(button => ['계속', '계속 생성', 'Continue', '다시 시도', '재시도', 'Retry'].some(text => (button.innerText || '').trim() === text));
          return { exists: true, generating: !!stop, hasResumeBtn: !!resume, text: last.innerText || '', allTexts: markdowns.map(item => item.innerText || '') };
        })()`,
      });
      const result = poll?.result?.value;
      if (!result) continue;
      if (result.text && result.text.length !== lastLength) {
        finalAnswer = result.text;
        lastLength = result.text.length;
        lastChangeTime = Date.now();
        stableCount = 0;
      } else if (result.text) {
        stableCount += 1;
      }

      if (result.hasResumeBtn && continuationCount < maxContinuations) {
        continuationCount += 1;
        await sendCDP('Runtime.evaluate', {
          expression: `(() => {
            const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
            const resume = buttons.find(button => ['계속', '계속 생성', 'Continue', '다시 시도', '재시도', 'Retry'].some(text => (button.innerText || '').trim() === text));
            if (resume) resume.click();
          })()`,
        });
        stableCount = 0;
        await delayWithSignal(2_000, signal);
        continue;
      }

      if (result.generating && Date.now() - lastChangeTime > 25_000 && continuationCount < maxContinuations) {
        continuationCount += 1;
        await sendCDP('Runtime.evaluate', {
          expression: `(() => {
            const stop = document.querySelector('div[role="button"][aria-label*="중지"], div[role="button"][aria-label*="Stop"]');
            if (stop) stop.click();
          })()`,
        });
        await delayWithSignal(1_500, signal);
        await sendPrompt('앞서 작성하던 내용이 멈췄습니다. 중단된 부분부터 누락 없이 이어서 계속 작성해주세요.');
        stableCount = 0;
        lastChangeTime = Date.now();
        continue;
      }

      if (!result.generating && finalAnswer && stableCount >= 3) {
        if (result.allTexts?.length > 1) finalAnswer = result.allTexts[result.allTexts.length - 1];
        break;
      }
    }

    throwIfAborted(signal);
    if (!finalAnswer) throw new Error('Timed out waiting for DeepSeek web assistant response.');
    return { ok: true, role, engine: 'deepseek-web-session', output: finalAnswer, continuations: continuationCount };
  } finally {
    try { ws?.close(); } catch {}
    if (closeUrl) {
      try {
        const closeResponse = await fetchWithDeadline(closeUrl, {
          method: 'GET',
        }, { timeoutMs: CDP_FETCH_TIMEOUT_MS, maxBytes: 64 * 1024 });
        if (!closeResponse.ok) console.warn(`[DeepSeek Worker] CDP close returned HTTP ${closeResponse.status}.`);
      } catch (error) {
        console.warn('[DeepSeek Worker] CDP tab cleanup failed:', error.message);
      }
    }
  }
}

function remaining(deadline) {
  const value = deadline - Date.now();
  if (value <= 0) throw new Error('DeepSeek web worker deadline exceeded.');
  return value;
}

function delayWithSignal(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error('Aborted'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal.reason || new Error('Aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForWebSocket(ws, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('WebSocket connection to Edge CDP timed out.')), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener?.('open', onOpen);
      ws.removeEventListener?.('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        try { ws.close(); } catch {}
        reject(error);
      } else resolve();
    };
    const onOpen = () => finish();
    const onError = error => finish(error instanceof Error ? error : new Error('CDP WebSocket error.'));
    const onAbort = () => finish(signal.reason || new Error('Aborted'));
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function sendCdpCommand(ws, allocateId, method, params, signal, timeoutMs) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error('Aborted'));
  return new Promise((resolve, reject) => {
    const id = allocateId();
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`CDP command ${method} timed out.`)), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve(result);
    };
    const onMessage = event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.id !== id) return;
      if (data.error) finish(new Error(`CDP error in ${method}: ${JSON.stringify(data.error)}`));
      else finish(null, data.result);
    };
    const onError = () => finish(new Error(`CDP WebSocket failed during ${method}.`));
    const onAbort = () => {
      try { ws.close(); } catch {}
      finish(signal.reason || new Error('Aborted'));
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    try { ws.send(JSON.stringify({ id, method, params })); } catch (error) { finish(error); }
  });
}

module.exports = { runDeepSeekWebWorker };
