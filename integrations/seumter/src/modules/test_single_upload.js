const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\##학장동 카페';

async function testSingleUpload() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03')) || pages[pages.length - 1];

  console.log('Page:', await page.title());

  // Handle any dialogs
  page.on('dialog', async dialog => {
    console.log('Dialog appeared:', dialog.message());
    await dialog.accept().catch(() => {});
  });

  // 1. Select A16(면적산출표)
  const clickRes = await page.evaluate(() => {
    const el = document.getElementById('BDA16_anchor');
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
      return { ok: true, text: el.innerText.trim() };
    }
    return { ok: false };
  });
  console.log('Click A16:', clickRes);

  await new Promise(r => setTimeout(r, 1500));

  // 2. Set input file
  const testFile = path.join(TARGET_DIR, '면적산출표.dwg');
  console.log('Injecting file:', testFile, 'Exists:', fs.existsSync(testFile));

  const fileInput = await page.$('input[type=file]');
  if (fileInput) {
    await fileInput.setInputFiles([testFile]);
    console.log('setInputFiles called successfully');
  } else {
    console.log('fileInput not found!');
  }

  await new Promise(r => setTimeout(r, 3000));

  // 3. Check file list in page
  const fileList = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr, .w2grid_body_table tr')).map(tr => tr.innerText.trim()).filter(t => t.length > 0);
    return rows;
  });
  console.log('Table rows after upload:', fileList);

  const shotPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\b7942295-e6e5-4228-a4d5-1e5292b34cb8\\screen_test_upload.png';
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log('Saved screenshot to:', shotPath);
  process.exit(0);
}

testSingleUpload().catch(console.error);
