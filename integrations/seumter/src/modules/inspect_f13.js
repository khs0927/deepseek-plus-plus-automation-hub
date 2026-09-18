const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectF13() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

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
      url: window.location.href,
      rows: rows.slice(0, 30),
      bodySnippet: document.body ? document.body.innerText.substring(0, 1000).replace(/\s+/g, ' ') : ''
    };
  });

  console.log('F13 Page Data:', JSON.stringify(info, null, 2));
}

inspectF13().catch(console.error);
