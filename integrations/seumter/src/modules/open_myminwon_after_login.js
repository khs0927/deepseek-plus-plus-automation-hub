const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function openMyMinwon() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  await page.bringToFront();
  console.log('User is logged in! Clicking 마이페이지 or navigating...');

  await page.evaluate(() => {
    const myPageBtn = Array.from(document.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('마이페이지'));
    if (myPageBtn) {
      console.log('Clicking MyPage button:', myPageBtn);
      myPageBtn.click();
    }
  });

  console.log('Waiting 4s for navigation...');
  await new Promise(r => setTimeout(r, 4000));

  console.log('Current URL:', page.url());
  console.log('Current Title:', await page.title());

  const info = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr, .list_item, .tbl_list tr')).map(tr => {
      const text = tr.innerText.replace(/\s+/g, ' ').trim();
      const links = Array.from(tr.querySelectorAll('a, button')).map(b => ({
        text: (b.innerText || b.value || '').trim(),
        href: b.getAttribute('href') || b.getAttribute('onclick') || ''
      }));
      return { text, links };
    });

    return {
      title: document.title,
      rows: rows.slice(0, 30),
      bodySnippet: document.body ? document.body.innerText.substring(0, 1000).replace(/\s+/g, ' ') : ''
    };
  });

  console.log('Page Data:', JSON.stringify(info, null, 2));
}

openMyMinwon().catch(console.error);
