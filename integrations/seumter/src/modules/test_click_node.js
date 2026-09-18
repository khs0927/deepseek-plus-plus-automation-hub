const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function testClickNode() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const res = await page.evaluate(() => {
    const el = document.getElementById('BDA14_anchor');
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
  await new Promise(r => setTimeout(r, 1500));

  const shotPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\b7942295-e6e5-4228-a4d5-1e5292b34cb8\\screen_after_a14.png';
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log('Saved screenshot to:', shotPath);
  process.exit(0);
}

testClickNode().catch(console.error);
