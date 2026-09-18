const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectAppPage() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();

  console.log(`Total Pages: ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    console.log(`\n=== Page [${i}] ===`);
    console.log(`Title: ${await p.title()}`);
    console.log(`URL: ${p.url()}`);

    const details = await p.evaluate(() => {
      // Find tabs and buttons
      const buttons = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a, .w2tabcontrol_tab')).map(b => ({
        id: b.id,
        text: (b.innerText || b.value || '').trim()
      })).filter(b => b.text.length > 0 && b.text.length < 30);

      const hasJstree = !!(document.getElementById('BDA10_anchor') || document.querySelector('.jstree'));
      const fileInputs = document.querySelectorAll('input[type=file]').length;

      return {
        hasJstree,
        fileInputs,
        buttons: buttons.filter(b => b.text.includes('설계') || b.text.includes('도서') || b.text.includes('개요') || b.text.includes('조서') || b.text.includes('저장'))
      };
    });

    console.log('Details:', JSON.stringify(details, null, 2));
  }
}

inspectAppPage().catch(console.error);
