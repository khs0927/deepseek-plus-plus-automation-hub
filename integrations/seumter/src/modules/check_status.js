const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function main() {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    console.log(`Contexts: ${contexts.length}`);
    for (const ctx of contexts) {
      const pages = ctx.pages();
      console.log(`Pages count: ${pages.length}`);
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        console.log(`[${i}] Title: "${await p.title()}" | URL: ${p.url()}`);
      }
    }
  } catch (err) {
    console.error('Failed to connect to CDP:', err.message);
  }
}

main();
