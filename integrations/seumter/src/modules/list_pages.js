const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function listPages() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  for (let c of contexts) {
    const pages = c.pages();
    for (let i = 0; i < pages.length; i++) {
      console.log(`[${i}] Title: "${await pages[i].title()}" | URL: ${pages[i].url()}`);
    }
  }
  process.exit(0);
}

listPages().catch(console.error);
