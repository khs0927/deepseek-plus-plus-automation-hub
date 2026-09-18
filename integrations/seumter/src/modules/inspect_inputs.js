const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectInputs() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  const inputs = await page.evaluate(() => {
    const fileInputs = Array.from(document.querySelectorAll('input[type=file]')).map(inp => ({
      id: inp.id,
      name: inp.name,
      className: inp.className,
      multiple: inp.multiple,
      accept: inp.accept,
      parent: inp.parentElement ? `${inp.parentElement.tagName}#${inp.parentElement.id}.${inp.parentElement.className}` : ''
    }));

    const actionButtons = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).map(b => ({
      id: b.id,
      text: (b.innerText || b.value || '').trim(),
      className: b.className
    })).filter(b => b.text.length > 0 && b.text.length < 30);

    return { fileInputs, actionButtons };
  });

  console.log('File Inputs:', JSON.stringify(inputs.fileInputs, null, 2));
  console.log('Action Buttons:', JSON.stringify(inputs.actionButtons, null, 2));
  process.exit(0);
}

inspectInputs().catch(console.error);
