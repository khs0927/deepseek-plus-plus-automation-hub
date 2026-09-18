const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function testClickBDC() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const res = await page.evaluate(() => {
    const el = document.getElementById('BDC37_anchor');
    if (el) {
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (p.classList && p.classList.contains('jstree-closed')) {
          const icon = p.querySelector('.jstree-icon');
          if (icon) icon.click();
        }
        p = p.parentElement;
      }
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, text: el.innerText.trim() };
    }
    return { ok: false };
  });

  console.log('Click result:', res);
  await new Promise(r => setTimeout(r, 1000));
  process.exit(0);
}

testClickBDC().catch(console.error);
