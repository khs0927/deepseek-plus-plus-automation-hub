const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function dumpAllCategories() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const categories = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('.jstree-anchor, a[id*=_anchor]'));
    return anchors.map(a => ({ id: a.id, text: a.innerText.trim() }));
  });

  // Print all top-level or main category groups
  const filtered = categories.filter(c => {
    return c.id.match(/^BD[A-Z]_anchor$/) || c.id.match(/^BD[A-Z][0-9]_anchor$/) || c.id.match(/^B[A-Z]_anchor$/) || c.id.match(/^B[A-Z][0-9]_anchor$/);
  });

  console.log('Main groups:');
  filtered.forEach(f => console.log(`${f.id.padEnd(20)} | ${f.text}`));
  process.exit(0);
}

dumpAllCategories().catch(console.error);
