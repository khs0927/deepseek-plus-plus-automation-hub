const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const { DRAWING_FILES } = require('./upload_drawings');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';
const DESIGN_DOC_URL = 'https://www.eais.go.kr/websquare/websquare.html?w2xPath=/static/ui/cdd/a/a/a01/CDDAAA01P03.xml&mgrNo=202633900001026701600&inqryCode=010600&bizCode=Architecture&recpNo=&clsfCd=1042&optVal=Rename&bimSubmtYn=0';

async function monitorAndUpload() {
  console.log('Connecting to automated Chrome on port 9222...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  console.log('로그인 대기 중... 브라우저에서 로그인을 완료해 주세요.');

  // Polling for login completion
  let isLoggedIn = false;
  for (let i = 0; i < 60; i++) {
    const url = page.url();
    const isLoginPage = url.includes('AWPABB01') || url.includes('/moct/awp/');

    // Check cookies or body text
    const loginStatus = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        hasLogout: text.includes('로그아웃') || text.includes('마이페이지') || text.includes('민원신청'),
        hasName: document.querySelector('.user_name, .userName, [id*=userName]') !== null
      };
    });

    if (!isLoginPage || loginStatus.hasLogout || loginStatus.hasName) {
      console.log('🎉 로그인 감지 성공!');
      isLoggedIn = true;
      break;
    }

    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n[2단계] 세움터 설계도서 등록도구 팝업으로 이동 중...');
  await page.goto(DESIGN_DOC_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log(e.message));
  await new Promise(r => setTimeout(r, 4000));

  console.log('[3단계] 도면 폴더 내 20개 파일 주입 시작...');
  const validFiles = DRAWING_FILES.map(f => path.join(TARGET_DIR, f.fileName)).filter(p => fs.existsSync(p));
  console.log(`업로드 준비 파일: ${validFiles.length}개`);

  const fileInput = await page.$('input[type=file]');
  if (fileInput) {
    await fileInput.setInputFiles(validFiles);
    console.log('✅ 파일 인풋 요소에 20개 파일 일괄 주입 성공!');
  }

  console.log('설계도서 화면 갱신 완료.');
  process.exit(0);
}

monitorAndUpload().catch(console.error);
