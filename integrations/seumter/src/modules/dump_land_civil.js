const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function dumpLandCivil() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const categories = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('.jstree-anchor, a[id*=_anchor]'));
    return anchors.map(a => ({ id: a.id, text: a.innerText.trim() }))
      .filter(c => c.id.startsWith('BDL') || c.id.startsWith('BDC') || c.id.startsWith('BDA1'));
  });

  console.log('Land, Civil, Arch Overview nodes:');
  categories.forEach(f => console.log(`${f.id.padEnd(20)} | ${f.text}`));
  process.exit(0);
}

dumpLandCivil().catch(console.error);
