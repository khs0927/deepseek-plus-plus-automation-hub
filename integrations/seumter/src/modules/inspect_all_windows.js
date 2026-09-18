const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectAll() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  console.log(`Contexts: ${contexts.length}`);

  for (let c = 0; c < contexts.length; c++) {
    const ctx = contexts[c];
    const pages = ctx.pages();
    console.log(`Context [${c}] Pages: ${pages.length}`);
    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const title = await page.title();
      const url = page.url();
      console.log(`  Page [${p}] Title: "${title}" | URL: ${url}`);

      const snippet = await page.evaluate(() => {
        return {
          title: document.title,
          text: document.body ? document.body.innerText.substring(0, 300).replace(/\s+/g, ' ') : '',
          hasJstree: !!document.querySelector('.jstree, .jstree-anchor'),
          jstreeCount: document.querySelectorAll('.jstree-anchor').length,
          fileInputs: document.querySelectorAll('input[type=file]').length
        };
      }).catch(e => ({ error: e.message }));
      console.log(`  Page [${p}] Snippet:`, snippet);
    }
  }
}

inspectAll().catch(console.error);
