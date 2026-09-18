const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function testDelete() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  // Make sure we are on A16
  await page.evaluate(() => {
    const el = document.getElementById('BDA16_anchor');
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Check file checkboxes
  const checkRes = await page.evaluate(() => {
    const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));
    const allCheck = document.getElementById('fileListAllCheck');
    if (allCheck) {
      allCheck.checked = true;
      allCheck.dispatchEvent(new Event('change', { bubbles: true }));
      allCheck.click();
      if (!allCheck.checked) allCheck.checked = true;
    }
    fileChecks.forEach(cb => {
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const delBtn = Array.from(document.querySelectorAll('a, button, input[type=button]')).find(el => {
      const text = (el.innerText || el.value || '').trim();
      return text === '선택 파일 삭제' || text === '선택파일삭제';
    });

    if (delBtn) {
      delBtn.click();
      return { found: true, count: fileChecks.length };
    }
    return { found: false, count: fileChecks.length };
  });

  console.log('Delete button click:', checkRes);
  await new Promise(r => setTimeout(r, 1000));

  // Click '예' on confirmation modal if present
  const modalRes = await page.evaluate(() => {
    const yesBtn = Array.from(document.querySelectorAll('button, input[type=button], a, .w2modal_content button, .w2messagebox_button, .btn')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '예';
    });
    if (yesBtn) {
      yesBtn.click();
      return { ok: true, text: yesBtn.innerText || yesBtn.value };
    }
    return { ok: false };
  });
  console.log('Modal result:', modalRes);

  await new Promise(r => setTimeout(r, 1500));

  const tableRows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table tr, .w2grid_body_table tr')).map(tr => tr.innerText.trim()).filter(t => t.length > 0);
  });
  console.log('Table rows after delete:', tableRows);
  process.exit(0);
}

testDelete().catch(console.error);
