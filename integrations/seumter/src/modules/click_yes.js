const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function clickYesNow() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();
  console.log('Clicking [예] button on the active confirmation modal...');

  const result = await page.evaluate(() => {
    // Find button/a with text '예'
    const yesBtn = Array.from(document.querySelectorAll('button, input[type=button], a, .w2modal_content button, .w2messagebox_button, .btn')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '예';
    });

    if (yesBtn) {
      yesBtn.click();
      return { ok: true, text: yesBtn.innerText || yesBtn.value, id: yesBtn.id };
    }
    return { ok: false };
  });

  console.log('Click result:', result);
}

clickYesNow().catch(console.error);
