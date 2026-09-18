const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function findJuryeMinwon() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages[2] || pages.find(p => p.url() === 'https://www.eais.go.kr/');

  await page.bringToFront();
  console.log('Inspecting Page 2 for My Minwon...');

  const info = await page.evaluate(() => {
    // Check if there are tables, list items, or links with 주례 or 315
    const links = Array.from(document.querySelectorAll('a, button, tr, td, .list, .table, .item')).map(el => {
      const t = (el.innerText || '').trim();
      return {
        tag: el.tagName,
        text: t.substring(0, 100),
        id: el.id,
        href: el.getAttribute('href') || el.getAttribute('onclick') || ''
      };
    }).filter(item => item.text.includes('주례') || item.text.includes('315') || item.text.includes('대수선') || item.text.includes('작성중'));

    return {
      matchedElements: links,
      bodySnippet: document.body.innerText.substring(0, 1500)
    };
  });

  console.log('Matches:', JSON.stringify(info.matchedElements, null, 2));
  console.log('\nBody Snippet:\n', info.bodySnippet);
}

findJuryeMinwon().catch(console.error);
