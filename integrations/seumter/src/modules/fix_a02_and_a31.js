const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

const A31_ALL_FILES = [
  '지1층평면도.dwg',
  '1층평면도(변경전).dwg',
  '1층평면도(변경후).dwg',
  '2층평면도(변경전).dwg',
  '2층평면도(변경후).dwg',
  '3층평면도(변경전).dwg',
  '3층평면도(변경후).dwg',
  '옥상층평면도.dwg',
  '1층평면도(건축물대장).dwg',
  '2층평면도(건축물대장).dwg',
  '3층평면도(건축물대장).dwg'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function navigateToNode(page, nodeId) {
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
      el.scrollIntoView({ block: 'center' });
      el.click();
    }
  }, nodeId);
  await sleep(1500);
}

async function purgeCurrentFolder(page) {
  const fileCount = await page.evaluate(() => {
    const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));
    if (fileChecks.length === 0) return 0;

    const allCheck = document.getElementById('fileListAllCheck');
    if (allCheck) {
      allCheck.checked = true;
      allCheck.dispatchEvent(new Event('change', { bubbles: true }));
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
    }
    return fileChecks.length;
  });

  if (fileCount > 0) {
    await sleep(1000);
    // Click '예' button on confirmation modal
    await page.evaluate(() => {
      const yesBtn = Array.from(document.querySelectorAll('button, input[type=button], a, .w2modal_content button, .w2messagebox_button, .btn')).find(b => {
        const t = (b.innerText || b.value || '').trim();
        return t === '예';
      });
      if (yesBtn) yesBtn.click();
    });
    await sleep(2000);
    return fileCount;
  }
  return 0;
}

async function fixA02AndA31() {
  console.log('================================================================');
  console.log('🔧 [A02 도면목록 완전 삭제 및 A31 평면도 11건 정밀 업로드]');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();

  // 1. A02(도면목록) 완전 삭제
  console.log('1. 📁 A02(도면목록) 진입...');
  await navigateToNode(page, 'BDA02_anchor');
  const a02Purged = await purgeCurrentFolder(page);
  console.log(`   🗑️ A02 삭제 결과: ${a02Purged}건 삭제됨`);

  await sleep(1000);

  // 2. A31(평면도) 완전 삭제 후 11개 순차 주입
  console.log('\n2. 📁 A31(평면도) 진입...');
  await navigateToNode(page, 'BDA31_anchor');
  const a31Purged = await purgeCurrentFolder(page);
  console.log(`   🗑️ A31 기존 파일 삭제 결과: ${a31Purged}건 삭제됨`);

  await sleep(1500);

  // 파일 업로드 창 정리
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('.btn_close, .upload_close, button, a')).filter(b => {
      const t = (b.innerText || '').trim();
      return t === 'x' || t === 'X';
    });
    closeBtns.forEach(b => {
      if (b.offsetParent !== null) b.click();
    });
  });

  // 11개 파일 주입 (안정적으로 1개씩 순차 주입)
  console.log(`\n3. 🚀 A31(평면도)에 11개 파일 순차 투입 시작:`);
  for (let i = 0; i < A31_ALL_FILES.length; i++) {
    const fileName = A31_ALL_FILES[i];
    const fullPath = path.join(TARGET_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      console.log(`   ⚠️ [${i+1}/11] 파일 없음: ${fileName}`);
      continue;
    }

    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles([fullPath]);
      console.log(`   ✔ [${i+1}/11] 업로드 투입: ${fileName}`);
    }
    await sleep(1500);
  }

  await sleep(2500);

  // 3. 최종 저장
  console.log('\n4. 💾 최종 저장 버튼 클릭...');
  await page.evaluate(() => {
    const saveBtn = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '저장' || t === '설계도서 저장' || t.includes('등록');
    });
    if (saveBtn) saveBtn.click();
  });

  await sleep(2000);
  console.log('\n================================================================');
  console.log('🎉 [완료] A02 정리 및 A31 11건 정밀 업로드 완료!');
  console.log('================================================================');
}

fixA02AndA31().catch(console.error);
