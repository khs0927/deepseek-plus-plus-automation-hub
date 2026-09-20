/**
 * integrations/seumter/src/utils/cdp_lifecycle_manager.js
 * Edge CDP 9222 세션 수명주기 관리 및 자가 치유(Self-Healing) 연결 매니저
 */

const http = require('http');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

class CdpLifecycleManager {
  /**
   * @param {number} port CDP 포트 (기본: 9222)
   * @param {string} endpoint CDP 엔드포인트 URL
   */
  constructor(port = 9222, endpoint = 'http://127.0.0.1:9222') {
    this.port = port;
    this.endpoint = endpoint;
  }

  /**
   * CDP 포트 헬스체크 (/json/version)
   */
  async isCdpReady() {
    return new Promise((resolve) => {
      const req = http.get(`${this.endpoint}/json/version`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1200, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * CDP 포트 가용성 보장 및 비정상 종료 시 launch_edge.js 자동 구동
   */
  async ensureCdpReady() {
    if (await this.isCdpReady()) {
      return { status: 'reused', endpoint: this.endpoint };
    }

    console.log('⚠️ [CDP Manager] CDP 9222 포트가 응답하지 않습니다. Edge 런처를 가동합니다...');
    const launcherPath = path.resolve(__dirname, 'launch_edge.js');
    const proc = spawn('node', [launcherPath], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    proc.unref();

    // 최대 10초간 폴링
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await this.isCdpReady()) {
        console.log('✅ [CDP Manager] Edge CDP 준비 완료');
        return { status: 'spawned', endpoint: this.endpoint };
      }
    }
    throw new Error('Edge CDP 9222 포트 기동 시간 초과 (10s)');
  }

  /**
   * 세움터 활성 페이지 탐색 및 컨텍스트 연결
   */
  async getSeumterPage() {
    await this.ensureCdpReady();
    const browser = await chromium.connectOverCDP(this.endpoint);
    const context = browser.contexts()[0] || (await browser.newContext());
    const pages = context.pages();

    let page = pages.find((p) => !p.isClosed() && (p.url().includes('eais.go.kr') || p.url().includes('websquare.html')));
    if (!page) {
      page = pages.find((p) => !p.isClosed()) || (await context.newPage());
      await page.goto('https://www.eais.go.kr/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await page.bringToFront();
    return { browser, context, page };
  }
}

module.exports = { CdpLifecycleManager };
