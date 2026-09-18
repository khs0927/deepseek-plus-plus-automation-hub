const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectScwin() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const page = browser.contexts()[0].pages()[0];

  const result = await page.evaluate(() => {
    const scwinKeys = typeof scwin !== 'undefined' ? Object.keys(scwin) : [];

    // Find all functions related to upload or tree
    const uploadFuncs = scwinKeys.filter(k => k.toLowerCase().includes('upload') || k.toLowerCase().includes('file') || k.toLowerCase().includes('tree') || k.toLowerCase().includes('drop') || k.toLowerCase().includes('save'));

    // Check DataLists
    const dataLists = [];
    if (typeof $p !== 'undefined' && $p.data) {
      for (const k in $p.data) {
        dataLists.push(k);
      }
    }

    // Check TreeView component
    const treeComp = typeof $p !== 'undefined' ? ($p.getComponentById('trv_tree') || $p.getComponentById('treeview') || $p.getComponentById('trv_menu')) : null;

    // Check form submission / uploader ID
    const forms = Array.from(document.querySelectorAll('form')).map(f => ({ id: f.id, action: f.action, name: f.name }));

    return {
      scwinKeysCount: scwinKeys.length,
      uploadFuncs,
      dataLists,
      forms
    };
  });

  console.log('--- SCWIN & WEBSQUARE STRUCTURE ---');
  console.log('Scwin Funcs:', result.uploadFuncs);
  console.log('DataLists:', result.dataLists);
  console.log('Forms:', result.forms);
  process.exit(0);
}

inspectScwin().catch(console.error);
