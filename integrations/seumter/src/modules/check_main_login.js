const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectMainPage() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url() === 'https://www.eais.go.kr/' || p.url().includes('eais.go.kr')) || pages[0];

  await page.bringToFront();
  console.log('Title:', await page.title());
  console.log('URL:', page.url());

  const userStatus = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const loginLink = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('로그아웃'));
    const myPageLink = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('마이페이지'));
    return {
      isLoggedIn: !!loginLink,
      hasMyPage: !!myPageLink,
      topLinks: Array.from(document.querySelectorAll('.util, .header_top, .top_menu, header, .header a')).map(a => (a.innerText || '').trim()).filter(Boolean)
    };
  });

  console.log('User Status:', JSON.stringify(userStatus, null, 2));
}

inspectMainPage().catch(console.error);
