const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectMypageMenu() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('AWPADC08F01') || p.url().includes('eais.go.kr')) || context.pages()[0];

  await page.bringToFront();
  console.log('Inspecting header/mypage links...');

  const links = await page.evaluate(() => {
    const myPageBtn = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').trim() === '마이페이지');
    return {
      myPageHref: myPageBtn ? myPageBtn.getAttribute('href') : null,
      myPageOnclick: myPageBtn ? myPageBtn.getAttribute('onclick') : null,
      allHeaderLinks: Array.from(document.querySelectorAll('header a, .util a, .top_menu a')).map(a => ({
        text: a.innerText.trim(),
        href: a.getAttribute('href'),
        onclick: a.getAttribute('onclick')
      }))
    };
  });

  console.log('Mypage links:', JSON.stringify(links, null, 2));

  // Let's click 마이페이지
  console.log('Clicking 마이페이지...');
  await page.evaluate(() => {
    const myPageBtn = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').trim() === '마이페이지');
    if (myPageBtn) myPageBtn.click();
  });

  await new Promise(r => setTimeout(r, 4000));
  console.log('Current URL after click:', page.url());
}

inspectMypageMenu().catch(console.error);
