const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectJstreeData() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const jstreeInfo = await page.evaluate(() => {
    // If jQuery and jstree are available
    if (window.$ && $.jstree) {
      const tree = $('.jstree').jstree(true);
      if (tree) {
        const json = tree.get_json('#', { flat: true });
        return json.map(item => ({
          id: item.id,
          parent: item.parent,
          text: item.text
        }));
      }
    }
    return null;
  });

  if (jstreeInfo) {
    console.log('Got jstree items:', jstreeInfo.length);
    // Find all leaf nodes or folders
    const landscaping = jstreeInfo.filter(i => i.id.includes('BDL') || i.id.includes('BDC') || i.id.includes('BDA1') || i.id.includes('BDA6'));
    console.log(JSON.stringify(landscaping, null, 2));
  } else {
    console.log('jstree instance not found via $.jstree');
  }
  process.exit(0);
}

inspectJstreeData().catch(console.error);
