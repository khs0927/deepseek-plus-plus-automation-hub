const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectFileInputsOnly() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input[type=file]')).map(inp => ({
      id: inp.id,
      name: inp.name,
      className: inp.className,
      multiple: inp.multiple,
      accept: inp.accept,
      outerHTML: inp.outerHTML,
      parent: inp.parentElement ? `${inp.parentElement.tagName}#${inp.parentElement.id}.${inp.parentElement.className}` : ''
    }));
  });

  console.log('File Inputs count:', inputs.length);
  console.log(JSON.stringify(inputs, null, 2));
  process.exit(0);
}

inspectFileInputsOnly().catch(console.error);
