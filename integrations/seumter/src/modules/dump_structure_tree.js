const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  console.log('Page Title:', await page.title());

  // Expand all jstree nodes first if possible
  const result = await page.evaluate(() => {
    // find all nodes in jstree
    const tree = window.$ && window.$.jstree ? window.$.jstree.reference('#treeview') || window.$.jstree.reference('.jstree') : null;
    if (tree) {
      // open all
      tree.open_all();
    }

    // gather all anchors
    const anchors = Array.from(document.querySelectorAll('.jstree-anchor')).map(a => {
      return {
        id: a.id,
        text: a.innerText.trim(),
        parent: a.parentElement ? a.parentElement.id : null
      };
    });
    return anchors;
  });

  console.log('Total anchors found:', result.length);
  const sNodes = result.filter(n => n.text.includes('구조') || n.id.includes('S') || n.id.includes('BDS') || n.text.includes('기초') || n.text.includes('기둥') || n.text.includes('보') || n.text.includes('슬래브') || n.text.includes('벽체') || n.text.includes('철골') || n.text.includes('일람표') || n.text.includes('상세도'));
  console.log('--- Matching Structure Nodes ---');
  console.log(JSON.stringify(sNodes, null, 2));

  console.log('--- All Anchors ---');
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
