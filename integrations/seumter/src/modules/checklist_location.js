const { getSeumterPage } = require('../utils/browser');
const { SELECTORS } = require('../config/constants');

async function runLocationChecklist() {
  console.log('================================================================');
  console.log('🗺️ [한국건축규정] 입지관련 체크리스트 (총 49개 항목) 자동 작성 시작');
  console.log('📋 용도변경 기준: 입지/신축 관련 규제 전수 [대상법규아님/비대상] 적용');
  console.log('================================================================\n');

  const { page } = await getSeumterPage();

  // 1. Close any open popup first
  await page.evaluate((popPrefix) => {
    const btnClose = document.getElementById(popPrefix + '_btn_close') || document.querySelector('.w2window_close');
    if (btnClose) btnClose.click();
  }, SELECTORS.POPUP_PREFIX);
  await new Promise(r => setTimeout(r, 800));

  // 2. Switch to '입지관련' in grd_lawordCust
  console.log('입지관련(0/49) 카테고리 전환 시도...');
  const switched = await page.evaluate(() => {
    const grid = document.getElementById('mf_wfm_selfgovn_content_wfm_BPMAZS01I01_grd_lawordCust_body_table');
    if (!grid) return false;

    const trs = Array.from(grid.querySelectorAll('tr'));
    for (const tr of trs) {
      if (tr.innerText.includes('입지관련')) {
        const btn = tr.querySelector('button, input[type=button], a');
        if (btn) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  });

  if (switched) {
    console.log('입지관련 카테고리 [보기] 클릭 완료!');
  } else {
    console.log('입지관련 카테고리 버튼을 찾지 못해 현재 그리드로 계속 진행합니다.');
  }
  await new Promise(r => setTimeout(r, 1200));

  // 3. Open popup (항목보기)
  console.log('입지관련 항목보기 팝업 열기...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input, a')).filter(el => (el.innerText || el.value || '').trim() === '항목보기');
    if (btns.length > 0) btns[0].click();
  });
  await page.waitForSelector(SELECTORS.POPUP_GRID, { state: 'visible', timeout: 15000 });

  // 4. Rewind to page 1
  console.log('입지관련 1페이지로 되감기 중...');
  for (let i = 0; i < 60; i++) {
    const isP1 = await page.evaluate((prefix) => {
      const grid = document.getElementById(prefix + '_grd_kcpCeckList_body_table');
      if (!grid) return true;
      if (grid.innerText.includes('건축법제55조') || grid.innerText.includes('(1/49)') || grid.innerText.includes('(1/48)')) return true;
      const btnPrev = document.getElementById(prefix + '_btn_prev') || document.getElementById(prefix + '_btn_Prev');
      if (btnPrev && !btnPrev.disabled && btnPrev.style.display !== 'none') {
        btnPrev.click();
        return false;
      }
      return true;
    }, SELECTORS.POPUP_PREFIX);
    if (isP1) break;
    await new Promise(r => setTimeout(r, 150));
  }
  console.log('입지관련 1페이지 위치 확인 완료!\n');

  // 5. Process all 49 location items
  let totalSteps = 49;
  for (let step = 1; step <= totalSteps; step++) {
    const stepResult = await page.evaluate(({ prefix }) => {
      const grid = document.getElementById(prefix + '_grd_kcpCeckList_body_table');
      if (!grid) return { status: 'no_grid' };

      const trs = Array.from(grid.querySelectorAll('tr'));
      if (trs.length === 0) return { status: 'no_rows' };

      // Identify Law Name
      let lawName = '';
      for (const tr of trs) {
        const tds = tr.querySelectorAll('td');
        if (tds[9] && tds[9].innerText.trim()) {
          lawName = tds[9].innerText.replace(/\s+/g, ' ').trim();
          break;
        }
      }

      // Group rows by Sub-item Title (Col 10)
      const groups = [];
      let curGroup = null;
      let lastTitle = '';

      trs.forEach((tr, rIdx) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 14) return;

        const col10_txt = tds[10] ? tds[10].innerText.replace(/\s+/g, ' ').trim() : '';
        const col11_txt = tds[11] ? tds[11].innerText.replace(/\s+/g, ' ').trim() : '';
        const subTitle = col10_txt || col11_txt || lastTitle || `group_${groups.length}`;

        if (col10_txt && col10_txt !== lastTitle) {
          lastTitle = col10_txt;
          curGroup = { title: col10_txt, rows: [] };
          groups.push(curGroup);
        } else if (!curGroup) {
          curGroup = { title: subTitle, rows: [] };
          groups.push(curGroup);
        }

        const mainCb = tds[12] ? tds[12].querySelector('input[type=checkbox], input[type=radio]') : null;
        const typeText = tds[13] ? tds[13].innerText.replace(/\s+/g, ' ').trim() : '';
        const clauseCb = tds[14] ? tds[14].querySelector('input[type=checkbox], input[type=radio]') : null;

        if (mainCb || typeText) {
          curGroup.rows.push({
            rIdx,
            typeText,
            hasMainCb: !!mainCb,
            hasClauseCb: !!clauseCb
          });
        }
      });

      // Select Non-Applicable for every group
      groups.forEach(grp => {
        let target = grp.rows.find(r => r.typeText === '대상법규아님' || r.typeText.includes('대상법규아님'));
        if (!target) target = grp.rows.find(r => r.typeText === '비대상' || r.typeText.includes('비대상'));
        if (!target) target = grp.rows.find(r => r.typeText === '예외대상' || r.typeText.includes('예외대상'));
        if (!target && grp.rows.length > 0) target = grp.rows[0];

        if (target) {
          // Uncheck all other rows in this group
          grp.rows.forEach(r => {
            if (r.rIdx !== target.rIdx) {
              const tr = trs[r.rIdx];
              if (tr) {
                const tds = tr.querySelectorAll('td');
                const mcb = tds[12] ? tds[12].querySelector('input[type=checkbox], input[type=radio]') : null;
                const ccb = tds[14] ? tds[14].querySelector('input[type=checkbox], input[type=radio]') : null;
                if (mcb && mcb.checked) mcb.click();
                if (ccb && ccb.checked) ccb.click();
              }
            }
          });

          // Check target row
          const tr = trs[target.rIdx];
          if (tr) {
            const tds = tr.querySelectorAll('td');
            const mcb = tds[12] ? tds[12].querySelector('input[type=checkbox], input[type=radio]') : null;
            const ccb = tds[14] ? tds[14].querySelector('input[type=checkbox], input[type=radio]') : null;
            if (mcb && !mcb.checked) mcb.click();
            if (ccb && ccb.checked) ccb.click();
          }
        }
      });

      // Save item
      const btnSave = document.getElementById(prefix + '_btn_save');
      if (btnSave) btnSave.click();

      // Check next
      const btnNext = document.getElementById(prefix + '_btn_Next') || document.getElementById(prefix + '_btn_next');
      const canGoNext = btnNext && !btnNext.disabled && btnNext.style.display !== 'none';

      return {
        status: 'ok',
        lawName,
        groupCount: groups.length,
        canGoNext
      };
    }, { prefix: SELECTORS.POPUP_PREFIX });

    if (stepResult.status !== 'ok') {
      console.log(`[Location Step ${step}] 그리드를 읽을 수 없어 중단합니다.`);
      break;
    }

    console.log(`✓ [입지 ${step}/${totalSteps}] ${stepResult.lawName} -> [대상법규아님/비대상 (${stepResult.groupCount}개 구분 전수 체크 완료)]`);

    if (!stepResult.canGoNext || step === totalSteps) {
      console.log(`\n입지관련 체크리스트 마지막 항목 (${step}) 도달 완료!`);
      break;
    }

    // Click Next
    await page.evaluate((prefix) => {
      const btnNext = document.getElementById(prefix + '_btn_Next') || document.getElementById(prefix + '_btn_next');
      if (btnNext) btnNext.click();
    }, SELECTORS.POPUP_PREFIX);

    await new Promise(r => setTimeout(r, 400));
  }

  // 6. Close popup and save main page
  console.log('\n팝업창 닫기 및 메인 체크리스트 최종 저장 중...');
  await page.evaluate(({ popPrefix, mainSaveId }) => {
    const btnClose = document.getElementById(popPrefix + '_btn_close') || document.querySelector('.w2window_close');
    if (btnClose) btnClose.click();
    const mainSave = document.getElementById(mainSaveId);
    if (mainSave) mainSave.click();
  }, { popPrefix: SELECTORS.POPUP_PREFIX, mainSaveId: SELECTORS.MAIN_SAVE_BTN });

  await new Promise(r => setTimeout(r, 1500));
  console.log('================================================================');
  console.log('🎉 [완료] 입지관련 체크리스트 (총 49개 항목) 전수 작성 및 저장 완료!');
  console.log('================================================================\n');
}

module.exports = { runLocationChecklist };

if (require.main === module) {
  runLocationChecklist().catch(console.error);
}
