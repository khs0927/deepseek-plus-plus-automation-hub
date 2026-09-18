const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function openDesignBookPopup() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page0 = context.pages().find(p => p.url().includes('BPMABA02F01') || p.url().includes('mgmNo=202633900001026701600')) || context.pages()[0];

  await page0.bringToFront();
  console.log('Clicking [설계도서] button on main application page...');

  await page0.evaluate(() => {
    const btn = document.getElementById('mf_wfm_selfgovn_content_udc_comRecpRightButton_trg_dsgnBook') ||
                Array.from(document.querySelectorAll('button, a, input[type=button]')).find(b => (b.innerText || b.value || '').trim() === '설계도서');
    if (btn) {
      console.log('Clicking 설계도서 button:', btn);
      btn.click();
    }
  });

  console.log('Waiting 5s for 설계도서 window to initialize...');
  await new Promise(r => setTimeout(r, 5000));

  const pages = context.pages();
  console.log(`Total Pages: ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    console.log(`[${i}] Title: "${await p.title()}" | URL: ${p.url()}`);
    const jstreeNodes = await p.evaluate(() => {
      return Array.from(document.querySelectorAll('.jstree-anchor')).map(a => ({ id: a.id, text: a.innerText }));
    }).catch(() => []);
    console.log(`    JSTree Nodes (${jstreeNodes.length}):`, jstreeNodes.slice(0, 10));
  }
}

openDesignBookPopup().catch(console.error);
