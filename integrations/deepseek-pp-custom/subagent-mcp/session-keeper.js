const fs = require('fs');
const path = require('path');

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
    this.wakeHistory = new Map(); // sessionId -> { lastWakeTime, wakeCount, lastAction }
    this.cooldownMs = config.cooldownMs || 15000; // 15 seconds
    this.maxConsecutiveWakes = config.maxConsecutiveWakes || 5;
    this.stallThresholdMs = config.stallThresholdMs || 25000; // 25 seconds of no progress
    this.sessionSnapshots = new Map(); // sessionId -> { lastLength, lastCheckTime, stallCount }
  }

  // Helper to run CDP commands on a WebSocket
  async runCDP(wsUrl, expression, awaitPromise = true) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try { ws.close(); } catch (e) {}
        reject(new Error('CDP evaluate timeout (15s)'));
      }, 15000);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression,
            returnByValue: true,
            awaitPromise
          }
        }));
      };

      ws.onmessage = (msg) => {
        clearTimeout(timer);
        try {
          const data = JSON.parse(msg.data);
          ws.close();
          if (data.error) {
            reject(new Error(`CDP error: ${JSON.stringify(data.error)}`));
          } else {
            resolve(data.result?.result?.value);
          }
        } catch (e) {
          ws.close();
          reject(e);
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
  }

  // Find all open DeepSeek tabs and extension sidepanel
  async getBrowserTargets() {
    try {
      const res = await fetch(`${this.cdpUrl}/json`);
      if (!res.ok) throw new Error(`CDP HTTP ${res.status}: ${res.statusText}`);
      const targets = await res.json();
      const dsTabs = targets.filter(t => t.url && t.url.includes('chat.deepseek.com'));
      const sidepanel = targets.find(t => t.url && t.url.includes('kdmpkkahkhdmdhfkdihkopikgcocbpbf/sidepanel.html'));
      return { dsTabs, sidepanel, allTargets: targets };
    } catch (e) {
      appendLog('ERROR', 'Failed to query CDP targets', { error: e.message });
      throw new Error(`Edge CDP not reachable at ${this.cdpUrl}: ${e.message}`);
    }
  }

  // Scan live status of all active DeepSeek sessions
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
          
          // Check for continue / retry buttons
          const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          const resumeBtn = allButtons.find(b => {
            const txt = (b.innerText || '').trim();
            return (
              txt === '계속' ||
              txt === '계속 생성' ||
              txt.includes('Continue') ||
              txt === '다시 시도' ||
              txt === '재시도' ||
              txt.includes('Retry') ||
              txt.includes('Regenerate')
            );
          });

          // Check DeepSeek++ agent container status if present
          const dppAgent = document.querySelector('.dpp-agent-container');
          const dppPhase = dppAgent ? dppAgent.getAttribute('data-console-phase') : null;
          const dppStatusText = dppAgent?.querySelector('.dpp-agent-status-text')?.innerText || null;

          // Check for failed tool calls badges
          const failedTools = Array.from(document.querySelectorAll('.dpp-agent-tool-item[data-tool-status="err"], .dpp-agent-tool-state')).map(el => el.innerText).filter(Boolean);

          const ta = document.querySelector('textarea');
          const isTextareaReady = !!ta && !ta.disabled;

          return {
            title,
            messageCount: markdowns.length,
            isGenerating: !!stopBtn,
            hasResumeBtn: !!resumeBtn,
            resumeBtnText: resumeBtn ? resumeBtn.innerText.trim() : null,
            dppPhase,
            dppStatusText,
            failedToolCount: failedTools.length,
            failedToolsSnippet: failedTools.slice(0, 3),
            textareaReady: isTextareaReady,
            lastTextSnippet: lastText.slice(-300),
            totalTextLength: lastText.length
          };
        })()`);

        let computedState = 'IDLE';
        if (statusData.isGenerating) {
          computedState = 'GENERATING';
        } else if (statusData.hasResumeBtn) {
          computedState = 'NEEDS_RESUME_BUTTON';
        } else if (statusData.dppPhase === 'error') {
          computedState = 'AGENT_ERROR';
        } else if (statusData.failedToolCount > 0 && statusData.dppPhase !== 'running') {
          computedState = 'TOOL_FAILURE_STALLED';
        } else if (statusData.lastTextSnippet.includes('interrupted') || statusData.lastTextSnippet.includes('타임아웃') || statusData.lastTextSnippet.includes('거부')) {
          computedState = 'STALLED';
        } else {
          computedState = 'WAITING_USER';
        }

        // Check if length has stalled
        const prevSnap = this.sessionSnapshots.get(sessionId);
        const now = Date.now();
        let isStalled = false;

        if (statusData.isGenerating) {
          if (prevSnap && prevSnap.lastLength === statusData.totalTextLength && (now - prevSnap.lastCheckTime) >= this.stallThresholdMs) {
            isStalled = true;
            computedState = 'GENERATION_STALLED';
          }
        }

        this.sessionSnapshots.set(sessionId, {
          lastLength: statusData.totalTextLength,
          lastCheckTime: now,
          isStalled
        });

        const wakeInfo = this.wakeHistory.get(sessionId) || { wakeCount: 0, lastWakeTime: null, lastAction: null };

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
          failedToolCount: statusData.failedToolCount,
          textareaReady: statusData.textareaReady,
          lastTextSnippet: statusData.lastTextSnippet,
          wakeInfo,
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
    if (filterSessionId) {
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

  // Combine live DOM state and extension trace logs for a comprehensive session report
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

  // Wake up a stalled or paused session
  async wakeUpSession({ sessionId = null, customMessage = null, forcePrompt = false } = {}) {
    const { dsTabs } = await this.getBrowserTargets();
    if (dsTabs.length === 0) {
      throw new Error('No active DeepSeek chat tabs found in Edge.');
    }

    let targetTab = null;
    if (sessionId && sessionId !== 'current') {
      targetTab = dsTabs.find(t => t.url.includes(sessionId));
    }
    if (!targetTab) {
      targetTab = dsTabs[0]; // Default to the first/active DeepSeek tab
    }

    const currentSessionId = (targetTab.url.match(/\/s\/([a-zA-Z0-9_-]+)/) || [])[1] || 'current';
    const now = Date.now();
    const wakeRecord = this.wakeHistory.get(currentSessionId) || { wakeCount: 0, lastWakeTime: 0, lastAction: null };

    // Cooldown check
    if (now - wakeRecord.lastWakeTime < this.cooldownMs) {
      const waitSec = Math.ceil((this.cooldownMs - (now - wakeRecord.lastWakeTime)) / 1000);
      return {
        ok: false,
        throttled: true,
        message: `세션 '${currentSessionId}' 깨우기 쿨다운 중입니다 (${waitSec}초 후 재시도 가능).`,
        sessionId: currentSessionId
      };
    }

    // Consecutive wakes check
    if (wakeRecord.wakeCount >= this.maxConsecutiveWakes) {
      appendLog('WARN', 'Max consecutive wakes exceeded', { sessionId: currentSessionId, count: wakeRecord.wakeCount });
      return {
        ok: false,
        maxRetriesExceeded: true,
        message: `세션 '${currentSessionId}'의 최대 연속 깨우기 횟수(${this.maxConsecutiveWakes}회)를 초과했습니다. 사용자의 직접 확인이 필요합니다.`,
        sessionId: currentSessionId
      };
    }

    // Default intelligent prompt
    const defaultResumePrompt = customMessage || '이전 작업이 중단되었습니다. 중단된 부분부터 누락 없이 이어서 계속 진행해주세요.';

    const wakeResult = await this.runCDP(targetTab.webSocketDebuggerUrl, `(async () => {
      const forcePrompt = ${JSON.stringify(forcePrompt)};
      const promptText = ${JSON.stringify(defaultResumePrompt)};

      // 1. Try clicking native Resume / Retry / Continue button if not forced
      if (!forcePrompt) {
        const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const resumeBtn = allButtons.find(b => {
          const txt = (b.innerText || '').trim();
          return (
            txt === '계속' ||
            txt === '계속 생성' ||
            txt.includes('Continue') ||
            txt === '다시 시도' ||
            txt === '재시도' ||
            txt.includes('Retry') ||
            txt.includes('Regenerate')
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
      }

      // 2. Inject text into textarea and click Send
      const ta = document.querySelector('textarea');
      if (!ta) {
        return { success: false, reason: 'Textarea not found on page' };
      }

      if (ta.disabled) {
        return { success: false, reason: 'Textarea is currently disabled (generation in progress)' };
      }

      ta.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, promptText);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));

      // Find send button
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
          action: 'Injected prompt and clicked Send button'
        };
      }

      return { success: false, reason: 'Send button not found or disabled' };
    })()`);

    if (wakeResult && wakeResult.success) {
      wakeRecord.wakeCount += 1;
      wakeRecord.lastWakeTime = now;
      wakeRecord.lastAction = wakeResult.action;
      this.wakeHistory.set(currentSessionId, wakeRecord);

      appendLog('INFO', 'Session wake-up succeeded', {
        sessionId: currentSessionId,
        method: wakeResult.method,
        action: wakeResult.action,
        wakeCount: wakeRecord.wakeCount
      });

      return {
        ok: true,
        sessionId: currentSessionId,
        method: wakeResult.method,
        action: wakeResult.action,
        wakeCount: wakeRecord.wakeCount,
        message: `[대화 세션 깨우기 성공]\n- 세션 ID: ${currentSessionId}\n- 방식: ${wakeResult.method}\n- 내용: ${wakeResult.action}\n- 누적 깨우기: ${wakeRecord.wakeCount}회`
      };
    } else {
      appendLog('WARN', 'Session wake-up failed', {
        sessionId: currentSessionId,
        reason: wakeResult?.reason || 'unknown'
      });
      return {
        ok: false,
        sessionId: currentSessionId,
        reason: wakeResult?.reason || 'Unknown error during wake-up',
        message: `[대화 세션 깨우기 실패] ${wakeResult?.reason || '알 수 없는 이유'}`
      };
    }
  }

  // Reset wake count for a session (e.g. after user confirms normal operation)
  resetWakeHistory(sessionId) {
    this.wakeHistory.delete(sessionId);
    appendLog('INFO', 'Wake history reset', { sessionId });
  }
}

module.exports = { SessionKeeper, appendLog };
