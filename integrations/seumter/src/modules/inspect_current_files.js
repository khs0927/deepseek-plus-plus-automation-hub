const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectCurrentFiles() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const info = await page.evaluate(() => {
    // Check WebSquare dataLists
    const dataLists = [];
    if (typeof $p !== 'undefined' && $p.data) {
      for (let key in $p.data) {
        const obj = $p.data[key];
        if (obj && typeof obj.getAllJSON === 'function') {
          const rows = obj.getAllJSON();
          if (rows && rows.length > 0) {
            dataLists.push({ id: key, count: rows.length, sample: rows.slice(0, 3) });
          }
        }
      }
    }

    // Check DOM file list or table
    const tableRows = Array.from(document.querySelectorAll('table tr, .w2grid_body_table tr')).map(tr => tr.innerText.trim()).filter(t => t.length > 0);

    return {
      dataLists,
      tableRows: tableRows.slice(0, 20)
    };
  });

  console.log('Inspection:');
  console.log('DataLists with rows:', JSON.stringify(info.dataLists, null, 2));
  console.log('Table rows:', JSON.stringify(info.tableRows, null, 2));
  process.exit(0);
}

inspectCurrentFiles().catch(console.error);
