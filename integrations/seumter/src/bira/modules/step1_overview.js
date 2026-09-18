const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { CDP_ENDPOINT, BIRA_STEPS } = require('../config/constants');

async function fillStep1Overview(projectConfigPath = null) {
  const config = projectConfigPath
    ? JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'))
    : require('../config/jurye_project.json');

  const { step1 } = config;
  console.log(`🚀 [BIRA 1단계: 기본정보 및 건축개요] 시작 - 프로젝트: ${config.projectName}`);

  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('write1.php'));

  if (!page) {
    console.log('⚠️ write1.php 페이지를 찾을 수 없습니다. 현재 페이지 목록 확인 중...');
    const allPages = ctx.pages();
    for (const p of allPages) {
      console.log(` - ${await p.title()} (${p.url()})`);
    }
    throw new Error('BIRA write1.php 페이지가 열려있지 않습니다.');
  }

  await page.bringToFront();

  // Fill form
  const appliedData = await page.evaluate(async (data) => {
    // 1. 신청구분
    const kind1Radio = document.querySelector(`input[name=kind1][value="${data.kind1}"]`);
    if (kind1Radio) {
      kind1Radio.checked = true;
      kind1Radio.dispatchEvent(new Event('click', { bubbles: true }));
      kind1Radio.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 2. 건축구분
    const kind2Radio = document.querySelector(`input[name=kind2][value="${data.kind2}"]`);
    if (kind2Radio) {
      kind2Radio.checked = true;
      kind2Radio.dispatchEvent(new Event('click', { bubbles: true }));
      kind2Radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const changeArea = document.getElementById('change_area');
    if (changeArea) changeArea.style.display = '';

    // 3. 건축위치
    const sido = document.getElementById('loca_sido');
    if (sido) sido.value = data.loca_sido || '부산';

    const gugun = document.getElementById('loca_gugun');
    if (gugun) {
      gugun.value = data.loca_gugun;
      gugun.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const dong = document.getElementById('loca_dong');
    if (dong) {
      dong.value = data.loca_dong;
      dong.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const bunji = document.getElementById('loca_bunji');
    if (bunji) {
      bunji.value = data.loca_bunji;
      bunji.dispatchEvent(new Event('input', { bubbles: true }));
      bunji.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 4. 건축주 정보
    const owerAddr = document.getElementById('ower_addr') || document.querySelector('input[name=ower_addr]');
    if (owerAddr) {
      owerAddr.value = data.ower_addr;
      owerAddr.dispatchEvent(new Event('input', { bubbles: true }));
      owerAddr.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const owerName = document.querySelector('input[name=ower_name]');
    if (owerName) {
      owerName.value = data.ower_name;
      owerName.dispatchEvent(new Event('input', { bubbles: true }));
      owerName.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 토지사용 동의여부
    const landUse1 = document.getElementById('land_use1');
    const landUse2 = document.getElementById('land_use2');
    if (data.land_use === 'own') {
      if (landUse1) landUse1.checked = true;
      if (landUse2) landUse2.checked = false;
    } else {
      if (landUse1) landUse1.checked = false;
      if (landUse2) landUse2.checked = true;
    }

    // 용도지역ㆍ지구
    const youngdoJigu = document.getElementById('youngdo_jigu') || document.querySelector('input[name=youngdo_jigu]');
    if (youngdoJigu) {
      youngdoJigu.value = data.youngdo_jigu;
      youngdoJigu.dispatchEvent(new Event('input', { bubbles: true }));
      youngdoJigu.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 5. 변경 전 / 변경 후 / 비고
    const change1 = document.querySelector('textarea[name=change_1]');
    if (change1) {
      change1.value = data.change_1;
      change1.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const change2 = document.querySelector('textarea[name=change_2]');
    if (change2) {
      change2.value = data.change_2;
      change2.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const change3 = document.querySelector('textarea[name=change_3]');
    if (change3) {
      change3.value = data.change_3;
      change3.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 6. 건물개요
    const setInput = (name, val) => {
      const el = document.querySelector(`input[name="${name}"]`) || document.getElementById(name);
      if (el && val !== undefined) {
        el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const setSelect = (name, val) => {
      const el = document.querySelector(`select[name="${name}"]`) || document.getElementById(name);
      if (el && val !== undefined) {
        el.value = String(val);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    setInput('b_land_width', data.b_land_width);
    setInput('b_build_width', data.b_build_width);
    setInput('b_gunfe', data.b_gunfe);
    setInput('b_yj_width', data.b_yj_width);
    setInput('b_youngjak', data.b_youngjak);
    setInput('b_yen_width', data.b_yen_width);
    setInput('b_yj_width_sin', data.b_yj_width_sin);

    setSelect('b_floor0', data.b_floor0);
    setSelect('b_floor1', data.b_floor1);
    setSelect('b_dong', data.b_dong);

    setSelect('b_youngdo', data.b_youngdo);
    if (data.b_youngdo2) setSelect('b_youngdo2', data.b_youngdo2);

    setSelect('b_gujo', data.b_gujo);
    setInput('b_height', data.b_height);
    setInput('b_jogung_width', data.b_jogung_width);
    setInput('b_parking', data.b_parking);
    setInput('b_outside', data.b_outside);

    setInput('bd_name', data.bd_name);
    setInput('bd_office', data.bd_office);
    setInput('bd_addr', data.bd_addr);

    return data;
  }, step1);

  await page.waitForTimeout(1000);

  // Set subcategories
  await page.evaluate((data) => {
    const setSelect = (name, val) => {
      const el = document.querySelector(`select[name="${name}"]`) || document.getElementById(name);
      if (el && val) {
        el.value = String(val);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    if (data.b_youngdo_sub) setSelect('b_youngdo_sub', data.b_youngdo_sub);
    if (data.b_youngdo_sub2) setSelect('b_youngdo_sub2', data.b_youngdo_sub2);

    if (typeof window.location_check === 'function') {
      window.location_check();
    }

    const sinInput = document.getElementById('b_yj_width_sin');
    if (sinInput) {
      sinInput.dispatchEvent(new Event('focusout', { bubbles: true }));
    }
  }, step1);

  console.log('✅ [BIRA 1단계] 기본정보 및 건축개요 입력 완료');
  return true;
}

if (require.main === module) {
  fillStep1Overview().catch(err => {
    console.error('❌ Step 1 실행 실패:', err);
    process.exit(1);
  });
}

module.exports = { fillStep1Overview };
