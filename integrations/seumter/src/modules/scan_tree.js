const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function scanEntireTree() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();

  // Get all jstree anchors
  const allNodes = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('.jstree-anchor')).map(a => ({
      id: a.id,
      text: a.innerText.trim()
    }));
    return anchors;
  });

  console.log(`Total jstree nodes: ${allNodes.length}`);
  const dwgNodes = allNodes.filter(n => n.text.startsWith('A') || n.text.startsWith('D') || n.text.startsWith('1') || n.text.startsWith('2') || n.text.startsWith('3') || n.text.startsWith('0') || n.text.includes('도면') || n.text.includes('평면') || n.text.includes('입면') || n.text.includes('단면') || n.text.includes('개요') || n.text.includes('배치'));

  console.log('DWG Nodes under D(도면):');
  dwgNodes.forEach(n => console.log(`  ID: ${n.id.padEnd(20)} | Text: "${n.text}"`));
}

scanEntireTree().catch(console.error);
