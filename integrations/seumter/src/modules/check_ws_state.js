const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function checkWebsquare() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    console.log(`\n=== Checking Page [${i}] (${page.url()}) ===`);
    try {
      // Dismiss any alert/confirm if present
      await page.evaluate(() => {
        const okBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn'))
          .filter(b => (b.innerText || b.value || '').trim() === '확인');
        for (const b of okBtns) {
          if (b.offsetParent !== null) {
            console.log('Clicking OK button:', b);
            b.click();
          }
        }
      });
      await new Promise(r => setTimeout(r, 1000));

      const wsInfo = await page.evaluate(() => {
        return {
          hasWebsquare: typeof WebSquare !== 'undefined',
          hasDollarW: typeof $w !== 'undefined',
          title: document.title,
          url: window.location.href,
          wframes: Array.from(document.querySelectorAll('wframe, [id*="wframe"]')).map(el => el.id),
          tabs: Array.from(document.querySelectorAll('.w2tabcontrol_contents, [id*="tab"]')).map(el => ({
            id: el.id,
            text: (el.innerText || '').substring(0, 50)
          }))
        };
      });
      console.log('WebSquare Info:', JSON.stringify(wsInfo, null, 2));
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}

checkWebsquare().catch(console.error);
