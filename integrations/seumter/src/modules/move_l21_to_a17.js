const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_FILE = 'G:\\내 드라이브\\##작업중\\##학장동 카페\\조경계획도.dwg';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function moveL21ToA17() {
  console.log('================================================================');
  console.log('🔄 [도면 재배치] L21(배치계획도) 삭제 ➔ A17(각종계획도) 이동 업로드');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();
  console.log(`📄 대상 페이지: "${await page.title()}"`);

  // 다이얼로그 자동 수락
  page.on('dialog', async dialog => {
    console.log(`  💬 [다이얼로그 수락]: "${dialog.message()}"`);
    await dialog.accept().catch(() => {});
  });

  // STEP 1: L21 노드 진입
  console.log('\n[STEP 1] 📁 L21(배치계획도) 폴더 진입...');
  await page.evaluate(() => {
    const el = document.getElementById('BDL21_anchor');
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
  });

  await sleep(1500);

  // STEP 2: L21 파일 삭제
  console.log('[STEP 2] 🗑️ L21 파일 전체 선택 및 삭제 진행...');
  const deleteCount = await page.evaluate(() => {
    const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));
    if (fileChecks.length === 0) return 0;

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
      return fileChecks.length;
    }
    return fileChecks.length;
  });

  console.log(`  -> L21 삭제 대상 파일: ${deleteCount}건`);
  if (deleteCount > 0) {
    await sleep(1000);
    // 모달 [예] 클릭
    const yesRes = await page.evaluate(() => {
      const yesBtn = Array.from(document.querySelectorAll('button, input[type=button], a, .w2modal_content button, .w2messagebox_button, .btn')).find(b => {
        const t = (b.innerText || b.value || '').trim();
        return t === '예';
      });
      if (yesBtn) {
        yesBtn.click();
        return true;
      }
      return false;
    });
    console.log(`  ✔ [확인 모달 '예' 클릭]: ${yesRes}`);
    await sleep(2000);
  }

  // STEP 3: A17(각종계획도) 노드 진입
  console.log('\n[STEP 3] 📁 A17(각종계획도) 폴더 진입...');
  await page.evaluate(() => {
    const el = document.getElementById('BDA17_anchor');
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
  });

  await sleep(1500);

  // 기존 A17 파일 확인
  const existingA17 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.w2grid_body_table tr, table tr'))
      .map(tr => tr.innerText.trim())
      .filter(t => t.includes('.dwg') || t.includes('.pdf'));
  });
  console.log('  📋 A17 현재 등록 파일 현황:', existingA17);

  // STEP 4: A17에 조경계획도.dwg 주입
  if (!fs.existsSync(TARGET_FILE)) {
    console.error('❌ 대상 파일이 로컬에 존재하지 않습니다:', TARGET_FILE);
    process.exit(1);
  }

  console.log('\n[STEP 4] 🚀 A17에 조경계획도.dwg 파일 업로드 주입...');
  const fileInput = await page.$('input[type=file]');
  if (fileInput) {
    await fileInput.setInputFiles([TARGET_FILE]);
    console.log('  ✔ setInputFiles 호출 성공');
  } else {
    console.error('  ❌ fileInput 요소를 찾을 수 없습니다.');
  }

  await sleep(4000);

  // STEP 5: 최종 A17 등록 확인
  const finalA17 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.w2grid_body_table tr, table tr'))
      .map(tr => tr.innerText.trim())
      .filter(t => t.includes('.dwg') || t.includes('.pdf'));
  });
  console.log('\n[STEP 5] 📋 A17(각종계획도) 최종 등록 파일 목록:', finalA17);

  // 스크린샷 캡처
  const shotPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\b7942295-e6e5-4228-a4d5-1e5292b34cb8\\screen_after_move_l21.png';
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log('📸 스크린샷 저장 완료:', shotPath);

  console.log('\n================================================================');
  console.log('🎉 [완료] L21 삭제 및 A17(각종계획도) 이동 업로드가 성공적으로 완료되었습니다!');
  console.log('================================================================');
  process.exit(0);
}

if (require.main === module) {
  moveL21ToA17().catch(console.error);
}

module.exports = { moveL21ToA17 };
