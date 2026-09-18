const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectAllWebSquare() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = browser.contexts()[0].pages()[0];

  const comps = await page.evaluate(() => {
    const list = [];
    if (typeof WebSquare !== 'undefined') {
      const all = document.querySelectorAll('[id^=mf_]');
      all.forEach(el => {
        list.push({
          id: el.id,
          tagName: el.tagName,
          className: el.className,
          text: (el.innerText || el.value || '').trim().slice(0, 50)
        });
      });
    }
    return list;
  });

  console.log('Total mf_ elements:', comps.length);
  comps.forEach(c => console.log(`[${c.tagName}] ID="${c.id}" Class="${c.className}" Text="${c.text}"`));
  process.exit(0);
}

inspectAllWebSquare().catch(console.error);
