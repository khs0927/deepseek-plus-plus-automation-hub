const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function checkNow() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();
  console.log(`Total Pages: ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    console.log(`Page [${i}]: Title="${await p.title()}" URL="${p.url()}"`);
  }
}

checkNow().catch(console.error);
