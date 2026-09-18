const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { CDP_URL } = require('../config/constants');

const cdpUrl = new URL(process.env.EDGE_CDP_URL || CDP_URL);
const port = Number(process.env.EDGE_PORT || cdpUrl.port || 9222);
const cdpEndpoint = `http://127.0.0.1:${port}`;
const userDataDir = process.env.EDGE_USER_DATA_DIR || 'C:\\edge_dev';
const targetUrl = process.env.EDGE_URL || 'https://www.eais.go.kr/';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isCdpReady() {
  return new Promise((resolve) => {
    const req = http.get(`${cdpEndpoint}/json/version`, res => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function setWindowVisible(context, page) {
  try {
    const session = await context.newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal', left: 50, top: 50, width: 1600, height: 1000 },
    });
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'maximized' },
    });
    await page.bringToFront().catch(() => {});
    await session.detach().catch(() => {});
  } catch (error) {
    console.warn(`Window focus note: ${error.message}`);
  }
}

async function launch() {
  fs.mkdirSync(userDataDir, { recursive: true });

  console.log('🚀 세움터용 Microsoft Edge 브라우저를 확인합니다...');
  console.log(`📌 CDP 포트: ${port}`);
  console.log(`📌 프로필 디렉토리: ${userDataDir}`);

  let context;
  if (await isCdpReady()) {
    console.log('♻️ 이미 실행 중인 CDP Edge를 재사용합니다.');
    const browser = await chromium.connectOverCDP(cdpEndpoint);
    context = browser.contexts()[0];
    if (!context) throw new Error('Connected Edge has no browser context');
  } else {
    console.log('▶️ CDP Edge가 없어 새 인스턴스를 시작합니다.');
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'msedge',
      headless: false,
      viewport: null,
      args: [
        `--remote-debugging-port=${port}`,
        '--remote-allow-origins=*',
        '--start-maximized',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
  }

  let page = context.pages().find(candidate => !candidate.isClosed() && candidate.url().includes('eais.go.kr'));
  if (!page) {
    page = context.pages().find(candidate => !candidate.isClosed() &&
      ['about:blank', 'edge://newtab/'].includes(candidate.url()));
  }
  if (!page) {
    page = context.pages().find(candidate => !candidate.isClosed());
  }
  if (!page) page = await context.newPage();

  if (!page.url() || page.url() === 'about:blank' || page.url() === 'edge://newtab/') {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }

  await setWindowVisible(context, page);

  console.log('✅ Microsoft Edge 브라우저가 화면에 정상적으로 열렸습니다.');
  console.log(`📌 현재 페이지: ${await page.title()} (${page.url()})`);
  console.log('ℹ️ 세움터 로그인 및 [설계도서] 페이지 준비를 대기합니다.');

  // Keep daemon alive
  await new Promise(() => {});
}

launch().catch(err => {
  console.error('Launch error:', err.message);
  process.exitCode = 1;
});
