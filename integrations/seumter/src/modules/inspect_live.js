const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectNow() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();

  console.log(`Total Pages: ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const title = await p.title();
    const url = p.url();
    const isLogin = await p.evaluate(() => {
      return !!Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('로그아웃'));
    }).catch(() => false);
    const hasTree = await p.evaluate(() => {
      return !!(document.getElementById('BDA10_anchor') || document.querySelector('.jstree'));
    }).catch(() => false);

    console.log(`[${i}] Title: "${title}" | URL: ${url} | LoggedIn: ${isLogin} | HasDrawingTree: ${hasTree}`);
  }
}

inspectNow().catch(console.error);
