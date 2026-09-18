const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function searchMinwon() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('AWPADC08F01')) || context.pages()[2];

  await page.bringToFront();
  console.log('Clicking 조회하기 on AWPADC08F01...');

  await page.evaluate(() => {
    const searchBtn = Array.from(document.querySelectorAll('button, input[type=button], a.btn, a')).find(b => (b.innerText || b.value || '').trim() === '조회하기');
    if (searchBtn) {
      console.log('Found search button:', searchBtn);
      searchBtn.click();
    }
  });

  console.log('Waiting 3s for results...');
  await new Promise(r => setTimeout(r, 3000));

  const info = await page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    const tableRows = Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
      const text = tr.innerText.replace(/\s+/g, ' ').trim();
      const links = Array.from(tr.querySelectorAll('a, button, input[type=button]')).map(b => ({
        text: (b.innerText || b.value || '').trim(),
        id: b.id,
        href: b.getAttribute('href') || b.getAttribute('onclick') || ''
      }));
      return { text, links };
    });

    return {
      tableRows,
      sampleText: text.substring(0, 1000)
    };
  });

  console.log('Table Rows:', JSON.stringify(info.tableRows, null, 2));
}

searchMinwon().catch(console.error);
