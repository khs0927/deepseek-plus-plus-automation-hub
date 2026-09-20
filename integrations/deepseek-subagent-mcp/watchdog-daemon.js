const { SessionKeeper, appendLog } = require('./session-keeper');

class WatchdogDaemon {
  constructor(config = {}) {
    this.keeper = new SessionKeeper(config);
    this.intervalMs = config.intervalMs || 15_000;
    this.autoWake = config.autoWake === true;
    this.timer = null;
    this.isRunning = false;
    this.tickInFlight = false;
    this.lastCheckTime = null;
    this.stats = {
      checksTotal: 0,
      checksSkippedOverlap: 0,
      stallsDetected: 0,
      wakesAttempted: 0,
      wakesSucceeded: 0,
    };
  }

  start() {
    if (this.isRunning) return this.getStatus();
    this.isRunning = true;
    appendLog('INFO', 'Watchdog Daemon started', { intervalMs: this.intervalMs, autoWake: this.autoWake });
    void this.tick();
    this.scheduleNext();
    return this.getStatus();
  }

  scheduleNext() {
    if (!this.isRunning) return;
    this.timer = setTimeout(async () => {
      await this.tick();
      this.scheduleNext();
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.isRunning = false;
    appendLog('INFO', 'Watchdog Daemon stopped');
  }

  async tick() {
    if (this.tickInFlight) {
      this.stats.checksSkippedOverlap += 1;
      appendLog('DEBUG', 'Watchdog tick skipped because the previous tick is still running');
      return this.getStatus();
    }
    this.tickInFlight = true;
    this.lastCheckTime = new Date().toISOString();
    this.stats.checksTotal += 1;
    try {
      const sessions = await this.keeper.scanSessions();
      for (const session of sessions) {
        const stalled = [
          'NEEDS_RESUME_BUTTON',
          'TOOL_FAILURE_STALLED',
          'GENERATION_STALLED',
          'AGENT_ERROR',
        ].includes(session.status);
        if (!stalled) continue;
        this.stats.stallsDetected += 1;
        appendLog('WARN', `Stall detected in session ${session.sessionId}`, {
          status: session.status,
          title: session.title,
          failedToolCount: session.failedToolCount,
        });
        if (!this.autoWake) continue;
        this.stats.wakesAttempted += 1;
        const result = await this.keeper.wakeUpSession({
          sessionId: session.sessionId,
          customMessage: session.status === 'TOOL_FAILURE_STALLED'
            ? '도구 실행 오류/타임아웃을 우회하여 다음 대안으로 작업을 계속 진행해주세요.'
            : undefined,
        });
        if (result.ok) this.stats.wakesSucceeded += 1;
      }
    } catch (error) {
      appendLog('DEBUG', 'Watchdog tick skipped (CDP check)', { error: error.message });
    } finally {
      this.tickInFlight = false;
    }
    return this.getStatus();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      autoWake: this.autoWake,
      tickInFlight: this.tickInFlight,
      lastCheckTime: this.lastCheckTime,
      stats: { ...this.stats },
    };
  }

  configure({ autoWake, intervalMs } = {}) {
    if (typeof autoWake === 'boolean') this.autoWake = autoWake;
    if (typeof intervalMs === 'number' && intervalMs >= 3_000) {
      this.intervalMs = intervalMs;
      if (this.isRunning) {
        if (this.timer) clearTimeout(this.timer);
        this.scheduleNext();
      }
    }
    appendLog('INFO', 'Watchdog configuration updated', { autoWake: this.autoWake, intervalMs: this.intervalMs });
    return this.getStatus();
  }
}

if (require.main === module) {
  const daemon = new WatchdogDaemon({ autoWake: process.env.SUBAGENT_WATCHDOG_AUTOWAKE === '1' });
  daemon.start();
  const shutdown = () => {
    daemon.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

module.exports = { WatchdogDaemon };
