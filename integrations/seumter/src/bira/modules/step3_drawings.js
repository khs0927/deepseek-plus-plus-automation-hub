const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { CDP_ENDPOINT } = require('../config/constants');

async function uploadStep3Drawings(projectConfigPath = null) {
  const config = projectConfigPath
    ? JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'))
    : require('../config/jurye_project.json');

  const { step3 } = config;
  console.log(`🚀 [BIRA 3단계: 도면파일 업로드] 시작 - 프로젝트: ${config.projectName}`);

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('write3.php'));

  if (!page) {
    console.log('⚠️ write3.php 페이지를 찾을 수 없습니다. 현재 페이지 목록 확인 중...');
    const allPages = ctx.pages();
    for (const p of allPages) {
      console.log(` - ${await p.title()} (${p.url()})`);
    }
    throw new Error('BIRA write3.php 페이지가 열려있지 않습니다.');
  }

  await page.bringToFront();

  // Category mapping to slot indices
  const slotMap = {
    '건축개요': 0,
    '법규검토서': 1,
    '배치도': 2,
    '각종계획도': 3,
    '구적도': 4,
    '실내재료마감': 5,
    '평면도': 6,
    '입면도': 7,
    '단면도': 8,
    '창호도': 9,
    '조경(50㎡이하)': 10,
    '건축물대장': 11,
    '건축분야 체크리스트': 12,
    '입지분야 체크리스트': 13,
    '기타법령사항': 14
  };

  const { filesDir, mappings } = step3;
  let uploadCount = 0;

  for (const [cate, fileName] of Object.entries(mappings)) {
    if (cate === '기타법령사항_해당없음' && fileName === true) {
      await page.evaluate(() => {
        const chk = document.getElementById('no_chk_14');
        if (chk) chk.checked = true;
      });
      console.log('  ✔ 기타법령사항 [해당없음] 체크 완료');
      continue;
    }

    const slotIdx = slotMap[cate];
    if (slotIdx === undefined) continue;

    const fullFilePath = path.isAbsolute(fileName) ? fileName : path.join(filesDir, fileName);
    if (fs.existsSync(fullFilePath)) {
      const fileInput = await page.$(`input[name="upfile_${slotIdx}[]"]`);
      if (fileInput) {
        await fileInput.setInputFiles(fullFilePath);
        console.log(`  ✔ [${cate}] 파일 주입: ${path.basename(fullFilePath)}`);
        uploadCount++;
      }
    } else {
      console.log(`  ⚠️ 파일 없음(스킵): ${fullFilePath}`);
    }
  }

  console.log(`✅ [BIRA 3단계] 도면 및 서류 ${uploadCount}건 매핑/주입 준비 완료`);
  return true;
}

if (require.main === module) {
  uploadStep3Drawings().catch(err => {
    console.error('❌ Step 3 실행 실패:', err);
    process.exit(1);
  });
}

module.exports = { uploadStep3Drawings };
