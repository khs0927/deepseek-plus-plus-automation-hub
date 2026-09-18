const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectPage0Now() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  const info = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const logoutBtn = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('로그아웃'));
    const myPageBtn = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('마이페이지'));
    const userSpan = document.querySelector('.user_name, .member_name, .user, strong.name');

    // Check if there are any iframes or websquare components
    const isWebsquare = typeof WebSquare !== 'undefined';
    const hasJstree = !!document.querySelector('.jstree, .jstree-anchor');

    return {
      title: document.title,
      url: window.location.href,
      isLoggedIn: !!logoutBtn,
      userName: userSpan ? userSpan.innerText : null,
      isWebsquare,
      hasJstree,
      textSnippet: text.substring(0, 400).replace(/\s+/g, ' ')
    };
  });

  console.log('Page [0] Details:', JSON.stringify(info, null, 2));
}

inspectPage0Now().catch(console.error);
