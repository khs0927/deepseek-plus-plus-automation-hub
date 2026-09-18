const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspect() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    console.log(`=== Page [${i}] ===`);
    console.log(`Title: ${await page.title()}`);
    console.log(`URL: ${page.url()}`);

    try {
      const info = await page.evaluate(() => {
        const titleEl = document.querySelector('h1, h2, h3, .title, .sub_title');
        const text = document.body ? document.body.innerText.substring(0, 500) : '';
        const buttons = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn'))
          .map(b => (b.innerText || b.value || '').trim())
          .filter(t => t.length > 0 && t.length < 30);
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.src || f.id || f.name);
        return {
          header: titleEl ? titleEl.innerText : '',
          sampleText: text.replace(/\s+/g, ' '),
          buttons: buttons.slice(0, 20),
          iframes
        };
      });
      console.log('Info:', JSON.stringify(info, null, 2));
    } catch (e) {
      console.log('Error evaluating page:', e.message);
    }
  }
}

inspect().catch(console.error);
