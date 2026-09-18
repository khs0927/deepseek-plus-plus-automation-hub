const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const DRAWING_TASKS = [
  { folderName: 'A10(개요)', nodeId: 'BDA10_anchor' },
  { folderName: 'A11(설계개요)', nodeId: 'BDA11_anchor' },
  { folderName: 'A31(평면도)', nodeId: 'BDA31_anchor' },
  { folderName: 'A32(입면도)', nodeId: 'BDA32_anchor' },
  { folderName: 'A33(주단면도)', nodeId: 'BDA33_anchor' },
  { folderName: 'A99(기타/건축물대장)', nodeId: 'BDA99_anchor' },
  { folderName: '507(검토서 - PDF)', nodeId: 'BC507_anchor' },
  { folderName: '510(확인서 - PDF)', nodeId: 'BC510_anchor' }
];

async function verifyAllFolders() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  console.log('================================================================');
  console.log('🔍 [최종 업로드 결과 검증]');
  console.log('================================================================\n');

  for (const task of DRAWING_TASKS) {
    await page.evaluate((nodeId) => {
      const el = document.getElementById(nodeId);
      if (el) el.click();
    }, task.nodeId);

    await new Promise(r => setTimeout(r, 1000));

    const filesInGrid = await page.evaluate(() => {
      const filenames = Array.from(document.querySelectorAll('td, .file_name, a, span'))
        .map(el => (el.innerText || '').trim())
        .filter(t => t.endsWith('.dwg') || t.endsWith('.pdf'));
      return Array.from(new Set(filenames));
    });

    console.log(`📁 "${task.folderName}" 파일 목록 (${filesInGrid.length}건):`);
    filesInGrid.forEach(f => console.log(`   - ${f}`));
    console.log();
  }
  console.log('================================================================');
}

verifyAllFolders().catch(console.error);
