const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function dumpBDA() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const treeNodes = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('.jstree-anchor, a[id*=_anchor]'));
    return anchors.map(a => ({
      id: a.id,
      text: a.innerText.trim()
    })).filter(n => n.id.startsWith('BDA'));
  });

  console.log('BDA nodes found:', treeNodes.length);
  treeNodes.forEach(n => {
    console.log(`id: ${n.id.padEnd(20)} | text: ${n.text}`);
  });
  process.exit(0);
}

dumpBDA().catch(console.error);
