const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectPage2() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages[2] || pages.find(p => p.url() === 'https://www.eais.go.kr/');

  if (!page) {
    console.log('Page 2 not found');
    return;
  }
  await page.bringToFront();
  console.log('Title:', await page.title());
  console.log('URL:', page.url());

  const userStatus = await page.evaluate(() => {
    const loginLink = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('로그아웃'));
    const myPageLink = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('마이페이지'));
    const headerText = document.querySelector('header, .header, .top_area') ? document.querySelector('header, .header, .top_area').innerText : '';
    return {
      isLoggedIn: !!loginLink,
      hasMyPage: !!myPageLink,
      headerText: headerText.replace(/\s+/g, ' ')
    };
  });

  console.log('Page 2 Status:', JSON.stringify(userStatus, null, 2));
}

inspectPage2().catch(console.error);
