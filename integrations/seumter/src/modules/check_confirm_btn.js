const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function checkConfirmBtn() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = browser.contexts()[0].pages().find(p => p.url().includes('CDDAAA01P03'));
  const btn = await page.evaluate(() => {
    const el = document.getElementById('mf_wfm_receptor_main_wq_uuid_157');
    if (el) {
      const rect = el.getBoundingClientRect();
      return {
        id: el.id,
        tagName: el.tagName,
        value: el.value,
        text: el.innerText,
        className: el.className,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        visible: el.offsetParent !== null
      };
    }
    return null;
  });
  console.log('Confirm btn:', btn);
  process.exit(0);
}

checkConfirmBtn().catch(console.error);
