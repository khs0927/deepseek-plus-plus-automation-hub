const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function navigateToMyMinwon() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url() === 'https://www.eais.go.kr/') || context.pages()[0];

  await page.bringToFront();
  console.log('Clicking 나의민원처리현황 or 나의민원조회...');

  await page.evaluate(() => {
    const link = Array.from(document.querySelectorAll('a')).find(a => (a.innerText || '').trim() === '나의민원처리현황' || (a.innerText || '').trim() === '나의민원조회');
    if (link) {
      console.log('Found link:', link.innerText);
      link.click();
    } else {
      console.log('Link not found directly');
    }
  });

  console.log('Waiting 4s for navigation/popups...');
  await new Promise(r => setTimeout(r, 4000));

  const pages = context.pages();
  console.log(`Total open pages: ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    console.log(`[${i}] Title: "${await pages[i].title()}" | URL: ${pages[i].url()}`);
  }
}

navigateToMyMinwon().catch(console.error);
