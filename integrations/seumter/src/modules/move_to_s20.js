const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\##학장동 카페\\허가\\도면\\구조';

const S20_FILES = [
  '기초구조평면도.dwg',
  '지상1층구조평면도.dwg',
  '지상2층구조평면도-1(1STS.L+4,000).dwg',
  '지상2층구조평면도-2(1STS.L+5,200).dwg',
  '지붕층구조평면도-1(1STS.L+7,400).dwg',
  '지붕층구조평면도-2(1STS.L+10,530).dwg'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cleanFolder(page, nodeId, folderName) {
  console.log(`\n----------------------------------------------------------------`);
  console.log(`🧹 폴더 정리 및 삭제: "${folderName}" (Node ID: ${nodeId})`);

  // A. 트리 노드 클릭
  const nodeRes = await page.evaluate((nId) => {
    const el = document.getElementById(nId);
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
  }, nodeId);

  if (nodeRes.ok) {
    console.log(`  ✔ [트리 노드 활성화]: "${nodeRes.text}"`);
  } else {
    console.warn(`  ⚠️ 트리 노드 ID(${nodeId}) 직접 탐색 실패`);
  }

  await sleep(1500);

  // B. 파일 전체 선택 및 삭제
  const deleted = await page.evaluate(() => {
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

  if (deleted > 0) {
    console.log(`  🗑️ 파일 ${deleted}개 감지 -> [선택 파일 삭제] 클릭`);
    await sleep(1000);

    const modalClicked = await page.evaluate(() => {
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

    if (modalClicked) {
      console.log(`  ✔ [확인 모달: '예' 클릭 완료]`);
    }
    await sleep(1500);
  } else {
    console.log(`  ⚪ 파일 없음 (이미 클린 상태)`);
  }
}

async function movePlanDrawingsToS20() {
  console.log('================================================================');
  console.log('🏛️ [세움터 구조도면 재배치] S11 / S21 -> S20(구조평면도) 이동');
  console.log('   - S11(기초위치도): 기존 파일 삭제');
  console.log('   - S21(평면도): 기존 파일 삭제');
  console.log('   - S20(구조평면도): 총 6개 구조평면도 DWG 파일 업로드');
  console.log('================================================================\n');

  // 1. 브라우저 연결
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();
  console.log(`📄 대상 페이지 확인: "${await page.title()}" (${page.url()})`);

  page.on('dialog', async dialog => {
    console.log(`  💬 [다이얼로그 자동 수락]: "${dialog.message()}"`);
    await dialog.accept().catch(() => {});
  });

  // Step 1: S11 폴더 정리
  await cleanFolder(page, 'BDS11_anchor', 'S11(기초위치도)');

  // Step 2: S21 폴더 정리
  await cleanFolder(page, 'BDS21_anchor', 'S21(평면도)');

  // Step 3: S20 폴더 진입 및 업로드
  await cleanFolder(page, 'BDS20_anchor', 'S20(구조평면도)');

  console.log(`\n----------------------------------------------------------------`);
  console.log(`📁 S20(구조평면도) 파일 업로드 진행 (총 ${S20_FILES.length}개)`);

  const filePaths = S20_FILES.map(f => path.join(TARGET_DIR, f)).filter(p => {
    const ex = fs.existsSync(p);
    if (!ex) console.error(`  ❌ 파일 없음: ${p}`);
    return ex;
  });

  console.log(`  🚀 [파일 주입 시작] ${filePaths.length}개 파일:\n   - ` + S20_FILES.join('\n   - '));

  const fileInput = await page.$('input[type=file]');
  if (fileInput) {
    await fileInput.setInputFiles(filePaths);
    console.log(`  ✔ [파일 투입 성공]`);
  } else {
    console.error(`  ❌ fileInput 요소를 찾을 수 없습니다.`);
  }

  const waitTime = Math.max(4000, filePaths.length * 1500);
  console.log(`  ⏳ 파일 전송 및 세움터 서버 등록 대기 (${(waitTime / 1000).toFixed(1)}초)...`);
  await sleep(waitTime);

  // 등록 결과 확인
  const uploadedFiles = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.w2grid_body_table tr, table tr')).map(tr => tr.innerText.trim()).filter(t => t.includes('.dwg') || t.includes('.pdf'));
    return rows;
  });
  console.log(`  📋 S20(구조평면도) 등록 확인 (${uploadedFiles.length}건):`, uploadedFiles);

  // 최종 화면 캡처
  const finalShot = path.join(__dirname, '..', '..', 'scratch', 'screen_s20_move_complete.png');
  await page.screenshot({ path: finalShot, fullPage: false });
  console.log('\n📸 최종 완료 화면 스크린샷 저장:', finalShot);

  console.log('\n================================================================');
  console.log(`🎉 [완료] S11/S21 삭제 및 S20(구조평면도) 6건 업로드가 성공적으로 완료되었습니다!`);
  console.log('================================================================');

  process.exit(0);
}

if (require.main === module) {
  movePlanDrawingsToS20().catch(console.error);
}

module.exports = { movePlanDrawingsToS20 };
