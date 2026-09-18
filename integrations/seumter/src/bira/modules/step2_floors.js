const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { CDP_ENDPOINT } = require('../config/constants');

async function fillStep2Floors(projectConfigPath = null) {
  const config = projectConfigPath
    ? JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'))
    : require('../config/jurye_project.json');

  const { step2 } = config;
  console.log(`🚀 [BIRA 2단계: 층별 개요 입력] 시작 - 프로젝트: ${config.projectName}`);

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('write2.php'));

  if (!page) {
    console.log('⚠️ write2.php 페이지를 찾을 수 없습니다. 현재 페이지 목록 확인 중...');
    const allPages = ctx.pages();
    for (const p of allPages) {
      console.log(` - ${await p.title()} (${p.url()})`);
    }
    throw new Error('BIRA write2.php 페이지가 열려있지 않습니다.');
  }

  await page.bringToFront();

  const result = await page.evaluate((data) => {
    const { floors } = data;
    floors.forEach((f, idx) => {
      const gujoEl = document.getElementById(`f_gujo_1_${idx}`);
      if (gujoEl) {
        gujoEl.value = f.gujo;
        gujoEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const youngdoEl = document.getElementById(`f_youngdo_1_${idx}`);
      if (youngdoEl) {
        youngdoEl.value = f.youngdo;
        youngdoEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const etcEl = document.getElementById(`f_etc_1_${idx}`);
      if (etcEl) {
        etcEl.value = f.etc;
        etcEl.dispatchEvent(new Event('input', { bubbles: true }));
        etcEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const widthEl = document.getElementById(`f_width_1_${idx}`);
      if (widthEl) {
        widthEl.value = f.width;
        widthEl.dispatchEvent(new Event('input', { bubbles: true }));
        widthEl.dispatchEvent(new Event('keyup', { bubbles: true }));
        widthEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    if (typeof window.tot_calc === 'function') {
      window.tot_calc();
    }

    return {
      floorsFilled: floors.length,
      allTotal: document.getElementById('all_total')?.innerText
    };
  }, step2);

  console.log(`✅ [BIRA 2단계] 층별 개요 ${result.floorsFilled}개 층 입력 완료 (합산 면적: ${result.allTotal} ㎡)`);
  return result;
}

if (require.main === module) {
  fillStep2Floors().catch(err => {
    console.error('❌ Step 2 실행 실패:', err);
    process.exit(1);
  });
}

module.exports = { fillStep2Floors };
