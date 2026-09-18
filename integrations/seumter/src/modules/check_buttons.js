const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function checkButtons() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const btns = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a, span.w2trigger')).map(b => ({
      id: b.id,
      text: (b.innerText || b.value || '').trim(),
      className: b.className,
      visible: b.offsetParent !== null
    })).filter(b => b.text.length > 0 && b.text.length < 20);
    return list;
  });

  console.log('Visible buttons:', btns.filter(b => b.visible));
  process.exit(0);
}

checkButtons().catch(console.error);
