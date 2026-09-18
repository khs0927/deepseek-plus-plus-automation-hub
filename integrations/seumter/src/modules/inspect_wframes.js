const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectWframes() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = browser.contexts()[0].pages()[0];

  const details = await page.evaluate(() => {
    const leftEl = document.getElementById('mf_wfm_receptor_left');
    const mainEl = document.getElementById('mf_wfm_receptor_main');

    const leftAll = leftEl ? Array.from(leftEl.querySelectorAll('*')).map(el => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      text: (el.innerText || el.value || '').slice(0, 40)
    })) : [];

    const mainAll = mainEl ? Array.from(mainEl.querySelectorAll('*')).map(el => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      text: (el.innerText || el.value || '').slice(0, 40)
    })) : [];

    return {
      leftCount: leftAll.length,
      mainCount: mainAll.length,
      leftElements: leftAll.slice(0, 30),
      mainElements: mainAll.slice(0, 30)
    };
  });

  console.log('Left Elements Count:', details.leftCount);
  console.log('Main Elements Count:', details.mainCount);
  console.log('Left Samples:', details.leftElements);
  console.log('Main Samples:', details.mainElements);
  process.exit(0);
}

inspectWframes().catch(console.error);
