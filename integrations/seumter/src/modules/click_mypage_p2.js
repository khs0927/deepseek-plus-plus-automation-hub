const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectMypage() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[2];

  await page.bringToFront();
  console.log('Inspecting Page 2:', page.url());

  const myPageInfo = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('마이페이지'));
    if (!btn) return { found: false };
    return {
      found: true,
      text: btn.innerText,
      href: btn.getAttribute('href'),
      onclick: btn.getAttribute('onclick'),
      outerHTML: btn.outerHTML
    };
  });

  console.log('MyPage Info:', myPageInfo);

  // Click it
  console.log('Clicking MyPage...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('마이페이지'));
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 4000));
  console.log('After click, Page 2 URL:', page.url());
}

inspectMypage().catch(console.error);
