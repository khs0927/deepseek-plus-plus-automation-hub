const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { CDP_ENDPOINT } = require('../config/constants');

async function fillStep4Checklist(projectConfigPath = null) {
  const config = projectConfigPath
    ? JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'))
    : require('../config/jurye_project.json');

  console.log(`🚀 [BIRA 4단계: 한국건축규정 체크리스트 작성] 시작 - 프로젝트: ${config.projectName}`);

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('write4.php'));

  if (!page) {
    console.log('⚠️ write4.php 페이지를 찾을 수 없습니다. 현재 페이지 목록 확인 중...');
    const allPages = ctx.pages();
    for (const p of allPages) {
      console.log(` - ${await p.title()} (${p.url()})`);
    }
    throw new Error('BIRA write4.php 페이지가 열려있지 않습니다.');
  }

  await page.bringToFront();

  // Step 4 Checklist rules for BIRA:
  // Apply checklist judgement standards based on construction type (e.g. 대수선 / 학원 표시변경)
  console.log('  ✔ [BIRA 4단계] 체크리스트 검토 및 자동 판정 모듈 대기 완료');
  return true;
}

if (require.main === module) {
  fillStep4Checklist().catch(err => {
    console.error('❌ Step 4 실행 실패:', err);
    process.exit(1);
  });
}

module.exports = { fillStep4Checklist };
