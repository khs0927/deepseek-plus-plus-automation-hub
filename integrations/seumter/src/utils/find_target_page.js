const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function listAllPages() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  console.log('--- ALL OPEN TABS / PAGES ---');
  let count = 0;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      count++;
      try {
        const title = await p.title();
        const url = p.url();
        console.log(`[Page ${count}] Title: "${title}" | URL: ${url}`);
      } catch (e) {
        console.log(`[Page ${count}] Error reading page:`, e.message);
      }
    }
  }
  process.exit(0);
}

listAllPages().catch(console.error);
