const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const NODES_TO_CHECK = [
  { name: 'A00(공통도면)', nodeId: 'BDA00_anchor', expected: 0 },
  { name: 'A02(도면목록)', nodeId: 'BDA02_anchor', expected: 0 },
  { name: 'A10(개요)', nodeId: 'BDA10_anchor', expected: 1 },
  { name: 'A11(설계개요)', nodeId: 'BDA11_anchor', expected: 0 },
  { name: 'A13(구적도_구적표)', nodeId: 'BDA13_anchor', expected: 0 },
  { name: 'A14(배치도_대지종횡단면도)', nodeId: 'BDA14_anchor', expected: 1 },
  { name: 'A31(평면도)', nodeId: 'BDA31_anchor', expected: 11 },
  { name: 'A32(입면도)', nodeId: 'BDA32_anchor', expected: 2 },
  { name: 'A33(주단면도)', nodeId: 'BDA33_anchor', expected: 2 },
  { name: 'A99(기타/건축물대장)', nodeId: 'BDA99_anchor', expected: 0 },
  { name: '507(검토서 - PDF)', nodeId: 'BC507_anchor', expected: 2 },
  { name: '510(확인서 - PDF)', nodeId: 'BC510_anchor', expected: 2 }
];

async function verifyAllFinal() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  console.log('================================================================');
  console.log('🔍 [최종 상태 전체 검증]');
  console.log('================================================================\n');

  for (const item of NODES_TO_CHECK) {
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (el) {
        let p = el.parentElement;
        while (p && p !== document.body) {
          if (p.classList && p.classList.contains('jstree-closed')) {
            const icon = p.querySelector('.jstree-icon');
            if (icon) icon.click();
          }
          p = p.parentElement;
        }
        el.click();
      }
    }, item.nodeId);

    await new Promise(r => setTimeout(r, 700));

    const files = await page.evaluate(() => {
      const filenames = Array.from(document.querySelectorAll('td, .file_name, a, span'))
        .map(el => (el.innerText || '').trim())
        .filter(t => t.endsWith('.dwg') || t.endsWith('.pdf'));
      return Array.from(new Set(filenames));
    });

    const statusIcon = files.length === item.expected ? '✅' : '⚠️';
    console.log(`${statusIcon} 📁 "${item.name}" (현재: ${files.length}건 / 예상: ${item.expected}건)`);
    if (files.length > 0) {
      files.forEach(f => console.log(`      - ${f}`));
    }
  }

  console.log('\n================================================================');
}

verifyAllFinal().catch(console.error);
