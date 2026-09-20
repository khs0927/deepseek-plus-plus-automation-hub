const fs = require('fs');
const path = require('path');
const { fetchWithDeadline, readResponseJson } = require('./request-helper');

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch (e) {}
}
const LOG_FILE = path.join(LOGS_DIR, 'sessions.log');

function appendLog(level, message, meta = {}) {
  const time = new Date().toISOString();
  const line = `[${time}] [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {
    console.error('Failed to write log:', e.message);
  }
}

class SessionKeeper {
  constructor(config = {}) {
    this.cdpUrl = config.cdpUrl || 'http://127.0.0.1:9223';
    this.wakeHistory = new Map();
    this.cooldownMs = config.cooldownMs || 30000; // 30 seconds cooldown
    this.maxConsecutiveWakes = config.maxConsecutiveWakes || 3;
    this.stallThresholdMs = config.stallThresholdMs || 35000;
    this.sessionSnapshots = new Map();
  }

  // Helper to run CDP commands on a WebSocket
  async runCDP(wsUrl, expression, awaitPromise = true, signal) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      const requestId = 1;
      const cleanup = () => {
        clearTimeout(timer);
        ws.removeEventListener?.('message', handler);
        ws.removeEventListener?.('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        try { ws.close(); } catch (e) {}
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('CDP evaluate timeout (15s)')), 15000);
      const handler = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.id !== requestId) return;
          if (data.error) finish(new Error(`CDP error: ${JSON.stringify(data.error)}`));
          else finish(null, data.result?.result?.value);
        } catch (e) {
          finish(e);
        }
      };
      const onError = () => finish(new Error('CDP WebSocket error'));
      const onAbort = () => finish(signal.reason || new Error('CDP request aborted'));

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          method: 'Runtime.evaluate',
          params: {
            expression,
            returnByValue: true,
            awaitPromise
          }
        }));
      };
      ws.addEventListener?.('message', handler);
      ws.addEventListener?.('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }

  async getBrowserTargets() {
    try {
      const res = await fetchWithDeadline(`${this.cdpUrl}/json`, {}, {
        timeoutMs: 5_000,
        maxBytes: 512 * 1024,
      });
      if (!res.ok) throw new Error(`CDP HTTP ${res.status}: ${res.statusText}`);
      const targets = await readResponseJson(res, 512 * 1024);
      if (!Array.isArray(targets)) throw new Error('CDP target list was not an array.');
      const dsTabs = targets.filter(t => t.url && t.url.includes('chat.deepseek.com'));
      const sidepanel = targets.find(t => t.url && t.url.includes('kdmpkkahkhdmdhfkdihkopikgcocbpbf/sidepanel.html'));
      return { dsTabs, sidepanel, allTargets: targets };
    } catch (e) {
      appendLog('ERROR', 'Failed to query CDP targets', { error: e.message });
      throw new Error(`Edge CDP not reachable at ${this.cdpUrl}: ${e.message}`);
    }
  }

  // Scan live status of all active DeepSeek sessions safely
  async scanSessions() {
    const { dsTabs } = await this.getBrowserTargets();
    const results = [];

    for (const tab of dsTabs) {
      const sessionMatch = tab.url.match(/\/s\/([a-zA-Z0-9_-]+)/);
      const sessionId = sessionMatch ? sessionMatch[1] : 'current-chat';

      try {
        const statusData = await this.runCDP(tab.webSocketDebuggerUrl, `(() => {
          const title = document.title;
          const markdowns = Array.from(document.querySelectorAll('.ds-markdown'));
          const last = markdowns[markdowns.length - 1];
          const lastText = last ? (last.innerText || '') : '';
          
          // Check for active stop button (generating in progress)
          const stopBtn = document.querySelector('div[role="button"][aria-label*="중지"], div[role="button"][aria-label*="Stop"], .ds-icon-button[aria-label*="stop"]');
          
          // Check for native continue / retry buttons ONLY in current view
          const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          const resumeBtn = allButtons.find(b => {
            const txt = (b.innerText || '').trim();
            return (
              txt === '계속' ||
              txt === '계속 생성' ||
              txt === 'Continue' ||
              txt === '다시 시도' ||
              txt === '재시도' ||
              txt === 'Retry'
            );
          });

          // Check DeepSeek++ agent container ONLY if it belongs to the LAST message
          const allContainers = Array.from(document.querySelectorAll('.dpp-agent-container'));
          const lastAgentContainer = allContainers[allContainers.length - 1];
          const dppPhase = lastAgentContainer ? lastAgentContainer.getAttribute('data-console-phase') : null;
          const dppStatusText = lastAgentContainer?.querySelector('.dpp-agent-status-text')?.innerText || null;

          // Check if user is currently typing or textarea has existing content
          const ta = document.querySelector('textarea');
          const isUserTyping = document.activeElement === ta;
          const hasUserInput = ta ? (ta.value && ta.value.trim().length > 0) : false;
          const isTextareaReady = !!ta && !ta.disabled;

          return {
            title,
            messageCount: markdowns.length,
            isGenerating: !!stopBtn,
            hasResumeBtn: !!resumeBtn,
            resumeBtnText: resumeBtn ? resumeBtn.innerText.trim() : null,
            dppPhase,
            dppStatusText,
            isUserTyping,
            hasUserInput,
            textareaReady: isTextareaReady,
            lastTextSnippet: lastText.slice(-300),
            totalTextLength: lastText.length
          };
        })()`);

        let computedState = 'IDLE';
        if (statusData.isGenerating) {
          computedState = 'GENERATING';
        } else if (statusData.isUserTyping || statusData.hasUserInput) {
          computedState = 'USER_ACTIVE'; // User is working or typing, NEVER INTERFERE!
        } else if (statusData.hasResumeBtn) {
          computedState = 'NEEDS_RESUME_BUTTON';
        } else if (statusData.dppPhase === 'error') {
          computedState = 'AGENT_ERROR';
        } else {
          computedState = 'WAITING_USER';
        }

        results.push({
          sessionId,
          tabId: tab.id,
          url: tab.url,
          title: statusData.title,
          status: computedState,
          isGenerating: statusData.isGenerating,
          hasResumeBtn: statusData.hasResumeBtn,
          resumeBtnText: statusData.resumeBtnText,
          dppPhase: statusData.dppPhase,
          dppStatusText: statusData.dppStatusText,
          isUserTyping: statusData.isUserTyping,
          hasUserInput: statusData.hasUserInput,
          textareaReady: statusData.textareaReady,
          lastTextSnippet: statusData.lastTextSnippet,
          checkedAt: new Date().toISOString()
        });
      } catch (err) {
        results.push({
          sessionId,
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          status: 'ERROR',
          error: err.message,
          checkedAt: new Date().toISOString()
        });
      }
    }

    return results;
  }

  // Get deep execution trace logs from extension chrome.storage.local
  async getExtensionTraceLogs(filterSessionId = null) {
    const { sidepanel } = await this.getBrowserTargets();
    if (!sidepanel) {
      return { ok: false, message: 'DeepSeek++ sidepanel/background target not found in Edge CDP.' };
    }

    const traces = await this.runCDP(sidepanel.webSocketDebuggerUrl, `(async () => {
      const all = await chrome.storage.local.get('dpp_inline_agent_traces');
      return all.dpp_inline_agent_traces || [];
    })()`);

    if (!Array.isArray(traces)) {
      return { ok: true, traces: [] };
    }

    let filtered = traces;
    if (filterSessionId && filterSessionId !== 'current') {
      filtered = traces.filter(t => t.chatSessionId === filterSessionId);
    }

    const formatted = filtered.map(t => ({
      traceId: t.id,
      chatSessionId: t.chatSessionId,
      status: t.status,
      totalSteps: t.totalSteps,
      totalTools: t.totalTools,
      error: t.error || null,
      createdAt: new Date(t.createdAt).toLocaleString('ko-KR'),
      updatedAt: new Date(t.updatedAt).toLocaleString('ko-KR'),
      durationSeconds: Math.round((t.updatedAt - t.createdAt) / 1000),
      steps: (t.steps || []).map(s => ({
        stepIndex: s.index,
        status: s.status,
        textSnippet: (s.text || '').slice(0, 150),
        toolExecutions: (s.toolExecutions || []).map(te => ({
          name: te.name,
          ok: te.result?.ok,
          summary: te.result?.summary,
          error: te.result?.error?.message || te.result?.detail || null
        }))
      }))
    }));

    return {
      ok: true,
      count: formatted.length,
      traces: formatted
    };
  }

  async getDetailedSessionLogs(sessionId = null) {
    const liveSessions = await this.scanSessions();
    const traceData = await this.getExtensionTraceLogs(sessionId);

    let targetSessions = liveSessions;
    if (sessionId && sessionId !== 'current') {
      targetSessions = liveSessions.filter(s => s.sessionId === sessionId);
    }

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      liveSessions: targetSessions,
      recentTraces: traceData.traces || []
    };
  }

  // Wake up a session safely ONLY upon explicit request or native button
  async wakeUpSession({ sessionId = null, customMessage = null, forcePrompt = false } = {}) {
    const { dsTabs } = await this.getBrowserTargets();
    if (dsTabs.length === 0) {
      throw new Error('No active DeepSeek chat tabs found in Edge.');
    }

    let targetTab = null;
    if (sessionId && sessionId !== 'current') {
      targetTab = dsTabs.find(t => t.url.includes(sessionId));
      if (!targetTab) {
        throw new Error(`DeepSeek session '${sessionId}' was not found in CDP targets.`);
      }
    }
    if (!targetTab) {
      targetTab = dsTabs[0];
    }

    const currentSessionId = (targetTab.url.match(/\/s\/([a-zA-Z0-9_-]+)/) || [])[1] || 'current';
    const now = Date.now();
    const wakeRecord = this.wakeHistory.get(currentSessionId) || { wakeCount: 0, lastWakeTime: 0 };

    if (now - wakeRecord.lastWakeTime < this.cooldownMs) {
      const waitSec = Math.ceil((this.cooldownMs - (now - wakeRecord.lastWakeTime)) / 1000);
      return {
        ok: false,
        throttled: true,
        message: `세션 '${currentSessionId}' 깨우기 쿨다운 중입니다 (${waitSec}초 대기).`,
        sessionId: currentSessionId
      };
    }

    const wakeResult = await this.runCDP(targetTab.webSocketDebuggerUrl, `(async () => {
      const forcePrompt = ${JSON.stringify(forcePrompt)};
      const promptText = ${JSON.stringify(customMessage || '')};

      // 1. Check if user is typing or has typed something - DO NOT TOUCH IF ACTIVE!
      const ta = document.querySelector('textarea');
      if (document.activeElement === ta || (ta && ta.value && ta.value.trim().length > 0)) {
        return { success: false, reason: '사용자가 현재 입력 중이거나 작성 중인 내용이 있어 자동 주입을 중단했습니다.' };
      }

      // 2. Try clicking native button first
      const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const resumeBtn = allButtons.find(b => {
        const txt = (b.innerText || '').trim();
        return (
          txt === '계속' ||
          txt === '계속 생성' ||
          txt === 'Continue' ||
          txt === '다시 시도' ||
          txt === '재시도' ||
          txt === 'Retry'
        );
      });

      if (resumeBtn && !resumeBtn.hasAttribute('disabled') && !resumeBtn.hasAttribute('aria-disabled')) {
        const btnName = resumeBtn.innerText.trim();
        resumeBtn.click();
        return {
          success: true,
          method: 'button_click',
          buttonName: btnName,
          action: \`Clicked '\${btnName}' button\`
        };
      }

      // 3. Only inject prompt if explicitly requested (forcePrompt or non-empty customMessage)
      if (!forcePrompt && !promptText) {
        return { success: false, reason: '클릭할 재시도/계속 버튼이 없으며, 자동 텍스트 주입은 안전을 위해 비활성화되어 있습니다.' };
      }

      if (!ta || ta.disabled) {
        return { success: false, reason: '입력창(textarea)을 사용할 수 없는 상태입니다.' };
      }

      ta.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, promptText);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));

      let parent = ta.parentElement;
      while (parent && !parent.querySelector('div[role="button"], button')) {
        parent = parent.parentElement;
      }
      const buttons = parent ? Array.from(parent.querySelectorAll('div[role="button"], button')) : [];
      const sendBtn = buttons.reverse().find(b => 
        !b.hasAttribute('aria-disabled') && 
        !b.disabled && 
        (b.className.includes('primary') || b.className.includes('filled') || b.querySelector('svg'))
      );

      if (sendBtn) {
        sendBtn.click();
        return {
          success: true,
          method: 'injected_prompt',
          injectedPrompt: promptText,
          action: 'Injected requested prompt and clicked Send'
        };
      }

      return { success: false, reason: '전송 버튼을 찾지 못했습니다.' };
    })()`);

    if (wakeResult && wakeResult.success) {
      wakeRecord.wakeCount += 1;
      wakeRecord.lastWakeTime = now;
      this.wakeHistory.set(currentSessionId, wakeRecord);
      appendLog('INFO', 'Session wake-up succeeded', { sessionId: currentSessionId, action: wakeResult.action });
      return {
        ok: true,
        sessionId: currentSessionId,
        message: `[깨우기 성공] ${wakeResult.action}`
      };
    } else {
      appendLog('INFO', 'Session wake-up skipped/failed', { sessionId: currentSessionId, reason: wakeResult?.reason });
      return {
        ok: false,
        sessionId: currentSessionId,
        reason: wakeResult?.reason || 'Unknown',
        message: `[깨우기 건너뜀] ${wakeResult?.reason || '작업이 진행 중이거나 안전 조건 미충족'}`
      };
    }
  }
}

module.exports = { SessionKeeper, appendLog };
