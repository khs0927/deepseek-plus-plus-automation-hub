const { SessionKeeper, appendLog } = require('./session-keeper');

class WatchdogDaemon {
  constructor(config = {}) {
    this.keeper = new SessionKeeper(config);
    this.intervalMs = config.intervalMs || 10000; // 10 seconds
    this.autoWake = config.autoWake !== false; // default true
    this.timer = null;
    this.isRunning = false;
    this.lastCheckTime = null;
    this.stats = {
      checksTotal: 0,
      stallsDetected: 0,
      wakesAttempted: 0,
      wakesSucceeded: 0
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    appendLog('INFO', 'Watchdog Daemon started', { intervalMs: this.intervalMs, autoWake: this.autoWake });
    console.log(`[Watchdog] Daemon started (interval: ${this.intervalMs / 1000}s, autoWake: ${this.autoWake})`);

    // Run first check immediately
    this.tick().catch(e => console.error('[Watchdog] Tick error:', e.message));

    this.timer = setInterval(() => {
      this.tick().catch(e => console.error('[Watchdog] Tick error:', e.message));
    }, this.intervalMs);
  }

  stop() {
    if (!this.isRunning) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    appendLog('INFO', 'Watchdog Daemon stopped');
    console.log('[Watchdog] Daemon stopped');
  }

  async tick() {
    this.lastCheckTime = new Date().toISOString();
    this.stats.checksTotal += 1;

    try {
      const sessions = await this.keeper.scanSessions();
      for (const sess of sessions) {
        // Check for stall conditions
        const isStalled = 
          sess.status === 'NEEDS_RESUME_BUTTON' || 
          sess.status === 'TOOL_FAILURE_STALLED' || 
          sess.status === 'GENERATION_STALLED' || 
          sess.status === 'AGENT_ERROR';

        if (isStalled) {
          this.stats.stallsDetected += 1;
          appendLog('WARN', `Stall detected in session ${sess.sessionId}`, {
            status: sess.status,
            title: sess.title,
            resumeBtn: sess.hasResumeBtn,
            failedToolCount: sess.failedToolCount
          });

          if (this.autoWake) {
            console.log(`[Watchdog] Auto-waking session '${sess.sessionId}' (status: ${sess.status})...`);
            this.stats.wakesAttempted += 1;

            const res = await this.keeper.wakeUpSession({
              sessionId: sess.sessionId,
              customMessage: sess.status === 'TOOL_FAILURE_STALLED'
                ? '도구 실행 오류/타임아웃을 우회하여 다음 대안으로 작업을 계속 진행해주세요.'
                : '이전 작업이 중단되었습니다. 중단된 부분부터 누락 없이 이어서 계속 진행해주세요.'
            });

            if (res.ok) {
              this.stats.wakesSucceeded += 1;
              console.log(`[Watchdog] Successfully awoke session '${sess.sessionId}': ${res.action}`);
            } else {
              console.log(`[Watchdog] Wake-up attempt for '${sess.sessionId}' skipped or failed: ${res.message || res.reason}`);
            }
          }
        }
      }
    } catch (e) {
      // Edge might be closed or starting up
      appendLog('DEBUG', 'Watchdog tick skipped (CDP check)', { error: e.message });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      autoWake: this.autoWake,
      lastCheckTime: this.lastCheckTime,
      stats: this.stats
    };
  }

  configure({ autoWake, intervalMs }) {
    if (typeof autoWake === 'boolean') {
      this.autoWake = autoWake;
    }
    if (typeof intervalMs === 'number' && intervalMs >= 3000) {
      this.intervalMs = intervalMs;
      if (this.isRunning) {
        this.stop();
        this.start();
      }
    }
    appendLog('INFO', 'Watchdog configuration updated', { autoWake: this.autoWake, intervalMs: this.intervalMs });
    return this.getStatus();
  }
}

// Standalone CLI execution support
if (require.main === module) {
  const daemon = new WatchdogDaemon({ intervalMs: 10000, autoWake: true });
  daemon.start();

  process.on('SIGINT', () => {
    daemon.stop();
    process.exit(0);
  });
}

module.exports = { WatchdogDaemon };
