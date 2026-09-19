const { SessionKeeper, appendLog } = require('./session-keeper');

class WatchdogDaemon {
  constructor(config = {}) {
    this.keeper = new SessionKeeper(config);
    this.intervalMs = config.intervalMs || 15000;
    this.autoWake = false; // PERMANENTLY DISABLED AUTO-INJECTION TO PREVENT INTERFERENCE
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
    // Keep dormant by default so it never runs unattended background injection
    this.isRunning = false;
    appendLog('INFO', 'Watchdog Daemon background timer disabled to protect user workflow');
    console.log('[Watchdog] Daemon auto-wake disabled to prevent workflow interference.');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  async tick() {
    // No automatic tick injection
  }

  getStatus() {
    return {
      isRunning: false,
      autoWake: false,
      message: '자동 주입 방지를 위해 백그라운드 Watchdog 타이머가 안전하게 정지되어 있습니다. 세션 확인 및 깨우기는 수동 요청 시에만 실행됩니다.'
    };
  }

  configure() {
    return this.getStatus();
  }
}

module.exports = { WatchdogDaemon };
