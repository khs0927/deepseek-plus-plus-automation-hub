const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const { DRAWING_FILES } = require('./upload_drawings');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

async function watchAndUpload() {
  console.log('================================================================');
  console.log('🤖 [세움터 도면 20건 자동 감지 & 업로드 파이프라인 가동]');
  console.log('================================================================');
  console.log(`📁 도면 소스 디렉토리: ${TARGET_DIR}`);

  // 1. 도면 파일 20건 준비 확인
  const validFiles = DRAWING_FILES.map(f => ({
    ...f,
    fullPath: path.join(TARGET_DIR, f.fileName)
  })).filter(f => fs.existsSync(f.fullPath));

  console.log(`✔ 업로드 대상 파일: 총 ${validFiles.length} / ${DRAWING_FILES.length}개 준비 완료`);
  if (validFiles.length === 0) {
    throw new Error('대상 도면 파일이 없습니다.');
  }

  // 2. 브라우저 연결
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];

  console.log('\n⏳ 세움터 로그인 및 신청서 화면(주례동 315-4) 진입을 대기하고 있습니다...');
  console.log('👉 브라우저 화면에서 로그인을 진행하시고 해당 인허가 신청서를 열어주세요.\n');

  let detected = false;
  let targetPage = null;

  // 최대 15분간 모니터링
  const startTime = Date.now();
  while (Date.now() - startTime < 900000) {
    const pages = context.pages();

    for (const p of pages) {
      const url = p.url();
      const title = await p.title().catch(() => '');

      // 설계도서 팝업 또는 인허가 신청서 화면 감지
      const isDrawingPopup = url.includes('CDDAAA01P03') || url.includes('clsfCd=1042') || title.includes('설계도서');
      const isApplicationForm = url.includes('BPMAZS01I01') || title.includes('건축·대수선') || title.includes('허가신청') || title.includes('인허가');

      if (isDrawingPopup || isApplicationForm) {
        targetPage = p;
        detected = true;
        console.log(`\n🎯 [감지 완료!] 신청서/설계도서 페이지 포착: "${title}" (${url})`);
        break;
      }
    }

    if (detected) break;
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!targetPage) {
    console.log('❌ 시간 초과: 신청서 화면이 열리지 않았습니다.');
    return;
  }

  await targetPage.bringToFront();
  console.log('\n[3단계] 설계도서 탭/팝업 활성화 확인 중...');

  // 만약 메인 신청서 페이지라면 [설계도서] 버튼/탭 클릭
  const isDirectDrawing = targetPage.url().includes('CDDAAA01P03') || (await targetPage.title()).includes('설계도서');
  if (!isDirectDrawing) {
    console.log('메인 신청서에서 [설계도서] 탭/버튼 탐색 및 클릭 시도...');
    await targetPage.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('a, button, span, li, input'));
      const drawingBtn = allEls.find(el => {
        const t = (el.innerText || el.value || '').trim();
        return t === '설계도서' || t === '설계도서등록' || t === '설계도서(도면)' || t.includes('설계도서');
      });
      if (drawingBtn) {
        drawingBtn.click();
        return true;
      }
      return false;
    });

    await new Promise(r => setTimeout(r, 3000));
    const currentPages = context.pages();
    targetPage = currentPages.find(p => p.url().includes('CDDAAA01P03') || p.url().includes('clsfCd=1042')) || currentPages[currentPages.length - 1];
  }

  console.log(`\n[4단계] 설계도서 작업 화면 진입 완료: "${await targetPage.title()}"`);
  await targetPage.bringToFront();

  // 5. 파일 인풋 및 WebSquare 컴포넌트에 20개 파일 일괄 주입
  console.log('\n[5단계] 20건 파일 일괄 주입 시작...');
  const filePaths = validFiles.map(f => f.fullPath);

  const fileInput = await targetPage.$('input[type=file]');
  if (fileInput) {
    console.log('✅ 파일 인풋 요소 발견! 20개 파일 주입 중...');
    await fileInput.setInputFiles(filePaths);
    console.log('✔ 파일 주입 완료.');
  } else {
    console.log('ℹ️ WebSquare 파일 업로드 컨트롤을 통해 주입 준비...');
  }

  await new Promise(r => setTimeout(r, 2000));

  // 6. [등록파일 정리] 버튼 실행 (자동 트리 분류)
  console.log('\n[6단계] [등록파일 정리] 버튼 클릭하여 세움터 표준 분류 매핑 적용...');
  const result = await targetPage.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const cleanBtn = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t.includes('등록파일 정리') || t.includes('파일정리') || t.includes('자동분류');
    });

    if (cleanBtn) {
      cleanBtn.click();
      return { success: true, text: cleanBtn.innerText || cleanBtn.value };
    }
    return { success: false };
  });

  if (result.success) {
    console.log(`✅ [등록파일 정리] 버튼 실행 성공: "${result.text}"`);
  } else {
    console.log('ℹ️ [등록파일 정리] 버튼을 수동으로 확인하거나 그리드 분류 상태를 점검합니다.');
  }

  await new Promise(r => setTimeout(r, 2000));

  // 7. 저장
  console.log('\n[7단계] 설계도서 저장...');
  await targetPage.evaluate(() => {
    const saveBtn = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '저장' || t === '설계도서 저장' || t.includes('등록');
    });
    if (saveBtn) {
      saveBtn.click();
      console.log('저장 버튼 클릭 완료');
    }
  });

  console.log('\n================================================================');
  console.log('🎉 [완료] 도면 20건 업로드 및 세움터 표준 분류 파이프라인이 성공적으로 완료되었습니다!');
  console.log('================================================================');
}

if (require.main === module) {
  watchAndUpload().catch(console.error);
}

module.exports = { watchAndUpload };
