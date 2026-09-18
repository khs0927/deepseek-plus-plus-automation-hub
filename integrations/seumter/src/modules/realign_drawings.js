const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

// 1. 완전히 비워야 할 폴더 목록 (잘못 올라간 파일 청소)
const FOLDERS_TO_PURGE = [
  { name: 'A00(공통도면)', nodeId: 'BDA00_anchor' },
  { name: 'A01(표지)', nodeId: 'BDA01_anchor' },
  { name: 'A02(도면목록)', nodeId: 'BDA02_anchor' },
  { name: 'A03(투시도_조감도)', nodeId: 'BDA03_anchor' },
  { name: 'A04(일반사항)', nodeId: 'BDA04_anchor' },
  { name: 'A09(기타)', nodeId: 'BDA09_anchor' },
  { name: 'A11(설계개요)', nodeId: 'BDA11_anchor' },
  { name: 'A12(안내도_지적도)', nodeId: 'BDA12_anchor' },
  { name: 'A13(구적도_구적표)', nodeId: 'BDA13_anchor' },
  { name: 'A99(기타/건축물대장)', nodeId: 'BDA99_anchor' }
];

// 2. 정상 도면 배치 구성 (총 17건)
const CORRECT_DRAWING_PLAN = [
  {
    folderName: 'A10(개요)',
    nodeId: 'BDA10_anchor',
    files: ['대수선개요.dwg']
  },
  {
    folderName: 'A14(배치도_대지종횡단면도)',
    nodeId: 'BDA14_anchor',
    files: ['배치도.dwg']
  },
  {
    folderName: 'A31(평면도)',
    nodeId: 'BDA31_anchor',
    files: [
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
    ]
  },
  {
    folderName: 'A32(입면도)',
    nodeId: 'BDA32_anchor',
    files: ['정면도.dwg', '우측면도.dwg']
  },
  {
    folderName: 'A33(주단면도)',
    nodeId: 'BDA33_anchor',
    files: ['종단면도(변경전).dwg', '종단면도(변경후).dwg']
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    await sleep(800);
    // 모달 '예' 클릭
    await page.evaluate(() => {
      const yesBtn = Array.from(document.querySelectorAll('button, input[type=button], a, .w2modal_content button, .w2messagebox_button, .btn')).find(b => {
        const t = (b.innerText || b.value || '').trim();
        return t === '예';
      });
      if (yesBtn) yesBtn.click();
    });
    await sleep(1500);
    return fileCount;
  }
  return 0;
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
  await sleep(1200);
}

async function realignDrawings() {
  console.log('================================================================');
  console.log('🧹 [도면 재정렬 및 잘못된 파일 삭제 & 평면도/배치도 재업로드]');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();

  // 1단계: 잘못된 위치 폴더들 완전 삭제/청소
  console.log('--- 1단계: 잘못 올라간 폴더들 완전 청소 ---');
  for (const folder of FOLDERS_TO_PURGE) {
    await navigateToNode(page, folder.nodeId);
    const purged = await purgeCurrentFolder(page);
    if (purged > 0) {
      console.log(`  🗑️ "${folder.name}" (${folder.nodeId}) -> ${purged}건 삭제 완료 ([예] 확인)`);
    } else {
      console.log(`  ⚪ "${folder.name}" -> 이미 비어있음`);
    }
  }

  // 2단계: 정규 도면 폴더 5개 재배치 (기존 파일 클린 ➔ 새 파일 주입)
  console.log('\n--- 2단계: 정규 도면 5개 폴더 재배치 및 업로드 ---');
  let totalUploaded = 0;

  for (let i = 0; i < CORRECT_DRAWING_PLAN.length; i++) {
    const plan = CORRECT_DRAWING_PLAN[i];
    console.log(`\n[${i + 1}/${CORRECT_DRAWING_PLAN.length}] 📁 "${plan.folderName}" (${plan.nodeId}) 진입`);

    await navigateToNode(page, plan.nodeId);

    // 기존 파일 삭제
    const purged = await purgeCurrentFolder(page);
    if (purged > 0) {
      console.log(`  🗑️ 기존 ${purged}건 삭제 완료`);
    }

    // 파일 주입
    const filePaths = plan.files.map(f => path.join(TARGET_DIR, f)).filter(p => fs.existsSync(p));
    console.log(`  🚀 [도면 ${filePaths.length}건 업로드]: ${plan.files.join(', ')}`);

    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      console.log(`  ✔ [파일 투입 성공]`);
      totalUploaded += filePaths.length;
    } else {
      console.log(`  ❌ fileInput 요소를 찾지 못했습니다.`);
    }

    await sleep(2500);
  }

  // 3단계: 최종 저장
  console.log('\n----------------------------------------------------------------');
  console.log(`💾 총 ${totalUploaded}건 도면 업로드 완료! 최종 저장 진행...`);

  await page.evaluate(() => {
    const saveBtn = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '저장' || t === '설계도서 저장' || t.includes('등록');
    });
    if (saveBtn) saveBtn.click();
  });

  await sleep(2000);

  console.log('\n================================================================');
  console.log(`🎉 [완료] 도면 재정렬 및 최종 저장이 완료되었습니다!`);
  console.log('================================================================\n');
}

if (require.main === module) {
  realignDrawings().catch(console.error);
}

module.exports = { realignDrawings, CORRECT_DRAWING_PLAN };
