const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const path = require('path');

async function captureScreen() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const shotPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\b7942295-e6e5-4228-a4d5-1e5292b34cb8\\screen_initial.png';
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log('Saved screenshot to:', shotPath);
  process.exit(0);
}

captureScreen().catch(console.error);
