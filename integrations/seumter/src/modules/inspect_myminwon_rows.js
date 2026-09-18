const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectMyMinwonList() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('AWPADC08F01')) || context.pages()[2];

  await page.bringToFront();
  console.log('Inspecting AWPADC08F01...');

  const info = await page.evaluate(() => {
    // Find all table rows, inputs, search buttons, links
    const rows = Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
      const cells = Array.from(tr.querySelectorAll('td, th')).map(td => td.innerText.replace(/\s+/g, ' ').trim());
      const links = Array.from(tr.querySelectorAll('a, button, input[type=button]')).map(b => ({
        text: (b.innerText || b.value || '').trim(),
        id: b.id,
        href: b.getAttribute('href') || b.getAttribute('onclick') || ''
      }));
      return { cells, links };
    });

    const searchButtons = Array.from(document.querySelectorAll('button, input[type=button], a.btn')).map(b => ({
      id: b.id,
      text: (b.innerText || b.value || '').trim()
    }));

    return {
      title: document.title,
      rows: rows.slice(0, 30),
      searchButtons
    };
  });

  console.log('Page Title:', info.title);
  console.log('Rows count:', info.rows.length);
  console.log('Rows:', JSON.stringify(info.rows, null, 2));
  console.log('Search Buttons:', info.searchButtons);
}

inspectMyMinwonList().catch(console.error);
