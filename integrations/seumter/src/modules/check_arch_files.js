const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function checkAllArchFolders() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();

  const archNodes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.jstree-anchor'))
      .map(a => ({ id: a.id, text: a.innerText.trim() }))
      .filter(n => n.id.startsWith('BDA'));
  });

  console.log(`Checking ${archNodes.length} architecture folders...`);

  for (const node of archNodes) {
    await page.evaluate((nodeId) => {
      const el = document.getElementById(nodeId);
      if (el) el.click();
    }, node.id);

    await new Promise(r => setTimeout(r, 600));

    const files = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('input[name=fileCheckList]')).map(cb => {
        const tr = cb.closest('tr');
        return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : 'file';
      });
      return rows;
    });

    if (files.length > 0) {
      console.log(`📁 [${node.id}] "${node.text}" -> ${files.length}개 파일 존재:`);
      files.forEach(f => console.log(`   - ${f}`));
    }
  }
}

checkAllArchFolders().catch(console.error);
