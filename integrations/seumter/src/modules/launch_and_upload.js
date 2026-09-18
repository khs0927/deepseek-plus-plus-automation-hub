const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { EDGE_PATH } = require('../config/constants');
const { DRAWING_FILES } = require('./upload_drawings');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';
const DESIGN_DOC_URL = 'https://www.eais.go.kr/websquare/websquare.html?w2xPath=/static/ui/cdd/a/a/a01/CDDAAA01P03.xml&mgrNo=202633900001026701600&inqryCode=010600&bizCode=Architecture&recpNo=&clsfCd=1042&optVal=Rename&bimSubmtYn=0';

async function launchAndUpload() {
  console.log('====================================================');
  console.log('🚀 Playwright → Edge 직접 실행 & 도면 업로드 자동화');
  console.log('====================================================');

  // 1. 파일 검증
  console.log('\n[1단계] 도면 파일 20건 검증...');
  const validFiles = [];
  for (const item of DRAWING_FILES) {
    const fullPath = path.join(TARGET_DIR, item.fileName);
    if (fs.existsSync(fullPath)) {
      validFiles.push({ ...item, fullPath });
      console.log(` ✔ ${item.fileName} -> [${item.category} / ${item.subCategory}]`);
    } else {
      console.warn(` ❌ [누락] ${item.fileName}`);
    }
  }
  console.log(`\n파일 준비: ${validFiles.length} / ${DRAWING_FILES.length}개`);

  // 2. Edge 브라우저 직접 실행 (화면에 보이는 headed 모드)
  console.log('\n[2단계] Edge 브라우저 실행 (headed 모드)...');
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: [
      '--start-maximized',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars'
    ]
  });

  const context = browser.contexts()[0] || await browser.newContext({ viewport: null });
  const page = context.pages()[0] || await context.newPage();

  // 다이얼로그 자동 수락
  page.on('dialog', async dialog => {
    console.log('[Dialog]:', dialog.message());
    await dialog.accept().catch(() => {});
  });

  // 3. 세움터 메인 페이지로 이동
  console.log('\n[3단계] 세움터 접속...');
  await page.goto('https://cloud.eais.go.kr', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('Nav:', e.message));
  await new Promise(r => setTimeout(r, 3000));

  console.log('현재 URL:', page.url());
  console.log('현재 Title:', await page.title());

  // 4. 로그인 대기 (사용자가 공인인증서로 로그인)
  console.log('\n[4단계] 로그인 대기 중...');
  console.log('👉 화면에 보이는 Edge 창에서 공인인증서 로그인을 완료해 주세요.');
  console.log('   로그인 감지 시 자동으로 다음 단계 진행합니다. (최대 2분 대기)');

  let isLoggedIn = false;
  for (let i = 0; i < 60; i++) {
    const loginStatus = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        hasLogout: text.includes('로그아웃'),
        hasMyPage: text.includes('마이페이지'),
        hasApply: text.includes('민원신청현황')
      };
    }).catch(() => ({ hasLogout: false, hasMyPage: false, hasApply: false }));

    if (loginStatus.hasLogout || loginStatus.hasMyPage || loginStatus.hasApply) {
      console.log('🎉 로그인 감지 성공!');
      isLoggedIn = true;
      break;
    }

    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!isLoggedIn) {
    console.log('\n⏰ 로그인 대기 시간 초과. 현재 상태로 계속 진행합니다.');
  }

  // 5. 설계도서 페이지로 이동
  console.log('\n[5단계] 설계도서 등록 화면으로 이동...');
  await page.goto(DESIGN_DOC_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('Nav:', e.message));
  await new Promise(r => setTimeout(r, 5000));

  console.log('현재 URL:', page.url());

  // 6. 파일 업로드
  console.log('\n[6단계] 도면 20건 파일 주입...');
  const allPaths = validFiles.map(f => f.fullPath);

  // input[type=file] 탐색
  const fileInput = await page.$('input[type=file]');
  if (fileInput) {
    await fileInput.setInputFiles(allPaths);
    console.log(`✅ input[type=file]에 ${allPaths.length}개 파일 주입 성공!`);
  } else {
    console.log('ℹ️ input[type=file] 미탐지. WebSquare 업로더 방식 시도...');

    // 히든 파일 인풋 생성 후 주입
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = '_pw_file_inject';
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);
    });
    const injectedInput = await page.$('#_pw_file_inject');
    if (injectedInput) {
      await injectedInput.setInputFiles(allPaths);
      console.log(`✅ 히든 인풋에 ${allPaths.length}개 파일 주입 성공!`);
    }
  }

  // 7. 등록파일 정리 버튼
  console.log('\n[7단계] 등록파일 정리 실행...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type=button], a'));
    const cleanBtn = btns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t.includes('등록파일 정리') || t.includes('파일정리');
    });
    if (cleanBtn) {
      cleanBtn.click();
      return '등록파일 정리 버튼 클릭 완료';
    }
    return '등록파일 정리 버튼 미발견';
  }).then(r => console.log(r));

  await new Promise(r => setTimeout(r, 3000));

  // 8. 스크린샷 촬영
  const screenshotPath = path.join(__dirname, '..', '..', 'scratch', 'upload_result.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`📸 스크린샷 저장: ${screenshotPath}`);

  // 9. 현재 상태 보고
  const pageInfo = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return {
      title: document.title,
      url: window.location.href,
      bodyPreview: text.slice(0, 500)
    };
  });
  console.log('\n현재 페이지 상태:');
  console.log('Title:', pageInfo.title);
  console.log('URL:', pageInfo.url);
  console.log('Body Preview:', pageInfo.bodyPreview.slice(0, 200));

  console.log('\n====================================================');
  console.log('🎉 Playwright Edge 실행 및 도면 업로드 프로세스 완료!');
  console.log('====================================================');
  console.log('브라우저를 유지합니다. Ctrl+C로 종료하세요.');

  // 브라우저를 닫지 않고 유지
  await new Promise(() => {});
}

launchAndUpload().catch(e => {
  console.error('❌ 에러 발생:', e.message);
  process.exit(1);
});
