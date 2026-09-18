const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function getSeumterPage() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  // Auto accept all WebSquare dialogs
  page.on('dialog', async dialog => {
    console.log('[Seumter Dialog]:', dialog.message());
    await dialog.accept().catch(() => {});
  });

  return { browser, context, page };
}

module.exports = { getSeumterPage };
