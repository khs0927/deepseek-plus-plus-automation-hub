const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectLoginPage() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[2];

  console.log('Page 2 URL:', page.url());
  const text = await page.evaluate(() => document.body ? document.body.innerText : '');
  console.log('Page 2 Text:\n', text.substring(0, 1500));
}

inspectLoginPage().catch(console.error);
