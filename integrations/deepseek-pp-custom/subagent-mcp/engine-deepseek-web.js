// Engine: DeepSeek Web Worker via Edge CDP (Zero API Key, 100% Free)
// Enhanced with Auto-Stall-Detection and Auto-Resume ("계속") recovery

async function runDeepSeekWebWorker({ role, task, cdpUrl = 'http://127.0.0.1:9223', timeoutMs = 180000, maxContinuations = 3 }) {
  let tabId = null;
  let ws = null;

  try {
    // 1. Open background tab
    const newTabRes = await fetch(`${cdpUrl}/json/new?https://chat.deepseek.com`, { method: 'PUT' });
    if (!newTabRes.ok) {
      throw new Error(`Failed to open Edge tab via CDP (${newTabRes.status}): ${newTabRes.statusText}`);
    }
    const tab = await newTabRes.json();
    tabId = tab.id;

    ws = new WebSocket(tab.webSocketDebuggerUrl);

    const sendCDP = (method, params = {}) => {
      return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 10000000);
        const timer = setTimeout(() => {
          ws.removeEventListener('message', handler);
          reject(new Error(`CDP command ${method} timed out`));
        }, 20000);

        const handler = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data.id === id) {
              clearTimeout(timer);
              ws.removeEventListener('message', handler);
              if (data.error) {
                reject(new Error(`CDP error in ${method}: ${JSON.stringify(data.error)}`));
              } else {
                resolve(data.result);
              }
            }
          } catch (e) {
            // ignore non-json
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await new Promise((resolve, reject) => {
      const openTimer = setTimeout(() => reject(new Error('WebSocket connection to Edge CDP timed out')), 10000);
      ws.onopen = () => {
        clearTimeout(openTimer);
        resolve();
      };
      ws.onerror = (err) => {
        clearTimeout(openTimer);
        reject(err);
      };
    });

    // 2. Wait for textarea to appear
    let ready = false;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const check = await sendCDP('Runtime.evaluate', {
        returnByValue: true,
        expression: '!!document.querySelector("textarea")'
      });
      if (check && check.result && check.result.value) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      throw new Error('DeepSeek web page did not load textarea in time. Is https://chat.deepseek.com accessible and logged in?');
    }

    // 3. Format Subagent Prompt
    const fullPrompt = [
      `[시스템 역할 위임: 당신은 '${role}' 역할을 전담하는 독립적인 전문 서브에이전트입니다.]`,
      `아래 주어진 세부 작업을 철저히 분석하고, 요구사항에 맞는 구체적이고 전문적인 결과 보고서를 작성하세요.`,
      `필요한 코드, 단계별 분석, 해결책을 누락 없이 포함해야 합니다.`,
      ``,
      `---`,
      `[작업 지시사항]`,
      task,
      `---`
    ].join('\n');

    // Helper to send text via textarea
    const sendPrompt = async (text) => {
      return await sendCDP('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const ta = document.querySelector('textarea');
          if (!ta) return { success: false, reason: 'no textarea' };
          ta.focus();
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          nativeSetter.call(ta, ${JSON.stringify(text)});
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));

          let parent = ta.parentElement;
          while (parent && !parent.querySelector('div[role="button"], button')) {
            parent = parent.parentElement;
          }
          const buttons = parent ? Array.from(parent.querySelectorAll('div[role="button"], button')) : [];
          const sendBtn = buttons.reverse().find(b => !b.hasAttribute('aria-disabled') && (b.className.includes('primary') || b.className.includes('filled') || b.querySelector('svg')));
          if (sendBtn) {
            sendBtn.click();
            return { success: true };
          }
          return { success: false, reason: 'send button not found or disabled' };
        })()`
      });
    };

    // 4. Inject prompt and click send
    const injectRes = await sendPrompt(fullPrompt);
    if (!injectRes?.result?.value?.success) {
      throw new Error(`Failed to submit prompt to DeepSeek: ${injectRes?.result?.value?.reason || 'unknown'}`);
    }

    // 5. Poll for assistant generation completion with Auto-Stall-Recovery
    const startTime = Date.now();
    let finalAnswer = '';
    let lastLength = 0;
    let stableCount = 0;
    let continuationCount = 0;
    let lastChangeTime = Date.now();

    // Initial wait for generation to start
    await new Promise(r => setTimeout(r, 2000));

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 1200));

      const pollRes = await sendCDP('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const markdowns = Array.from(document.querySelectorAll('.ds-markdown'));
          if (markdowns.length === 0) return { exists: false, generating: true, text: '' };

          const last = markdowns[markdowns.length - 1];
          const stopBtn = document.querySelector('div[role="button"][aria-label*="중지"], div[role="button"][aria-label*="Stop"], .ds-icon-button[aria-label*="stop"]');
          
          const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
          const resumeBtn = allButtons.find(b => {
            const txt = (b.innerText || '').trim();
            return txt === '계속' || txt === '계속 생성' || txt.includes('Continue') || txt === '다시 시도' || txt.includes('Retry');
          });

          return {
            exists: true,
            generating: !!stopBtn,
            hasResumeBtn: !!resumeBtn,
            text: last.innerText,
            allTexts: markdowns.map(m => m.innerText)
          };
        })()`
      });

      const res = pollRes?.result?.value;
      if (res && res.text) {
        finalAnswer = res.text;

        if (finalAnswer.length !== lastLength) {
          lastLength = finalAnswer.length;
          lastChangeTime = Date.now();
          stableCount = 0;
        } else {
          stableCount++;
        }

        // Case 1: Resume / Continue button popped up (DeepSeek stopped mid-generation)
        if (res.hasResumeBtn && continuationCount < maxContinuations) {
          continuationCount++;
          console.log(`[DeepSeek Worker] Native Continue/Resume button detected. Auto-clicking (continuation #${continuationCount})...`);
          await sendCDP('Runtime.evaluate', {
            expression: `(() => {
              const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
              const resumeBtn = allButtons.find(b => {
                const txt = (b.innerText || '').trim();
                return txt === '계속' || txt === '계속 생성' || txt.includes('Continue') || txt === '다시 시도' || txt.includes('Retry');
              });
              if (resumeBtn) resumeBtn.click();
            })()`
          });
          stableCount = 0;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        // Case 2: Hang detection - Generating button exists but text hasn't changed for 25 seconds
        if (res.generating && (Date.now() - lastChangeTime > 25000) && continuationCount < maxContinuations) {
          continuationCount++;
          console.log(`[DeepSeek Worker] Stall detected during generation (25s unchanged). Sending '계속' (continuation #${continuationCount})...`);
          // Try clicking stop first, then send "계속"
          await sendCDP('Runtime.evaluate', {
            expression: `(() => {
              const stopBtn = document.querySelector('div[role="button"][aria-label*="중지"], div[role="button"][aria-label*="Stop"]');
              if (stopBtn) stopBtn.click();
            })()`
          });
          await new Promise(r => setTimeout(r, 1500));
          await sendPrompt('앞서 작성하던 내용이 멈췄습니다. 중단된 부분부터 누락 없이 이어서 계속 작성해주세요.');
          stableCount = 0;
          lastChangeTime = Date.now();
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        // Case 3: Normal completion - Not generating and text stable for at least 3 poll intervals (~3.6s)
        if (!res.generating && stableCount >= 3) {
          // If the final markdown was just "thinking" and there is another or full text, resolve cleanly
          if (res.allTexts && res.allTexts.length > 1) {
            finalAnswer = res.allTexts[res.allTexts.length - 1];
          }
          break;
        }
      }
    }

    if (!finalAnswer) {
      throw new Error('Timed out waiting for DeepSeek web assistant response');
    }

    return {
      ok: true,
      role,
      engine: 'deepseek-web-session',
      output: finalAnswer,
      continuations: continuationCount
    };
  } finally {
    // Clean up WebSocket and background tab
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (tabId) {
      try {
        await fetch(`${cdpUrl}/json/close/${tabId}`);
      } catch (e) {}
    }
  }
}

module.exports = { runDeepSeekWebWorker };
