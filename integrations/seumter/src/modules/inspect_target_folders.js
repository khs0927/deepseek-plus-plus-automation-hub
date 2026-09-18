const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function inspectFolders() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  const folders = [
    { name: 'A21(실내재료마감표)', id: 'BDA21_anchor' },
    { name: 'A32(입면도)', id: 'BDA32_anchor' },
    { name: 'A33(주단면도)', id: 'BDA33_anchor' }
  ];

  for (let f of folders) {
    await page.evaluate((nodeId) => {
      const el = document.getElementById(nodeId);
      if (el) {
        let p = el.parentElement;
        while (p && p !== document.body) {
          if (p.classList && p.classList.contains('jstree-closed')) {
            const icon = p.querySelector('.jstree-icon');
            if (icon) icon.click();
          }
          p = p.parentElement;
        }
        el.scrollIntoView({ block: 'center' });
        el.click();
      }
    }, f.id);

    await sleep(1500);

    const files = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.w2grid_body_table tr, table tr'))
        .map(tr => tr.innerText.trim())
        .filter(t => t.includes('.dwg') || t.includes('.pdf'));
      const checkboxes = document.querySelectorAll('input[name=fileCheckList]').length;
      return { checkboxes, rows };
    });

    console.log(`=== ${f.name} ===`);
    console.log(`Checkboxes count: ${files.checkboxes}`);
    console.log('Files:', files.rows.slice(0, 6));
  }

  process.exit(0);
}

inspectFolders().catch(console.error);
