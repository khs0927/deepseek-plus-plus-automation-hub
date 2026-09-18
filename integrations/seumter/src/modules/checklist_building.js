const { getSeumterPage } = require('../utils/browser');
const { SELECTORS } = require('../config/constants');

function isBuildingLawApplicable(lawName, itemTitle) {
  const full = (lawName + ' ' + itemTitle).replace(/\s+/g, ' ');
  // 1. 용도변경 (제19조)
  if (full.includes('제19조') || full.includes('용도변경')) return true;
  // 2. 건축물의 설계 (제23조)
  if (full.includes('제23조') || full.includes('설계자') || full.includes('작성기준') || full.includes('서명날인')) return true;
  // 3. 구조내력 및 내진안전 (제48조)
  if (full.includes('제48조') && (full.includes('구조안전') || full.includes('구조내력') || full.includes('내진') || full.includes('하중'))) return true;
  // 4. 피난시설, 계단, 복도, 출입문 (제49조)
  if (full.includes('제49조') && (full.includes('계단') || full.includes('직통계단') || full.includes('피난') || full.includes('복도') || full.includes('출입문') || full.includes('난간') || full.includes('방화구획') || full.includes('거실'))) return true;
  // 5. 내화구조 및 방화구획 (제50조)
  if (full.includes('제50조') && (full.includes('내화구조') || full.includes('방화벽') || full.includes('방화구획'))) return true;
  // 6. 방화지구 (제51조)
  if (full.includes('제51조') && full.includes('방화')) return true;
  // 7. 마감재료의 불연화 (제52조)
  if (full.includes('제52조') && (full.includes('마감재료') || full.includes('내부마감') || full.includes('불연') || full.includes('준불연'))) return true;
  // 8. 실내건축 안전기준 (제52조의2)
  if (full.includes('제52조의2') || full.includes('실내건축')) return true;
  // 9. 환기설비 (제53조)
  if (full.includes('제53조') && (full.includes('환기') || full.includes('환기설비'))) return true;

  return false;
}

async function runBuildingChecklist() {
  console.log('================================================================');
  console.log('🏢 [한국건축규정] 건축물관련 체크리스트 (총 107개 항목) 자동 작성 시작');
  console.log('================================================================\n');

  const { page } = await getSeumterPage();

  // 1. Open popup if not open
  const isPopupOpen = await page.evaluate((prefix) => {
    const pop = document.getElementById(prefix);
    return pop && window.getComputedStyle(pop).display !== 'none';
  }, 'mf_wfm_selfgovn_content_wfm_BPMAZS01I01_BPMAZS01P07');

  if (!isPopupOpen) {
    console.log('팝업창 열기 시도 (항목보기 버튼 클릭)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input, a')).filter(el => (el.innerText || el.value || '').trim() === '항목보기');
      if (btns.length > 0) btns[0].click();
    });
    await page.waitForSelector(SELECTORS.POPUP_GRID, { state: 'visible', timeout: 15000 });
  }

  // 2. Rewind to page 1
  console.log('1페이지로 되감기 중...');
  for (let i = 0; i < 115; i++) {
    const isP1 = await page.evaluate((prefix) => {
      const grid = document.getElementById(prefix + '_grd_kcpCeckList_body_table');
      if (!grid) return true;
      if (grid.innerText.includes('건축법제23조') || grid.innerText.includes('(1/107)') || grid.innerText.includes('(1/106)')) return true;
      const btnPrev = document.getElementById(prefix + '_btn_prev') || document.getElementById(prefix + '_btn_Prev');
      if (btnPrev && !btnPrev.disabled && btnPrev.style.display !== 'none') {
        btnPrev.click();
        return false;
      }
      return true;
    }, SELECTORS.POPUP_PREFIX);
    if (isP1) break;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('1페이지 위치 확인 완료!\n');

  // 3. Process all items
  let totalSteps = 107;
  for (let step = 1; step <= totalSteps; step++) {
    const pageResult = await page.evaluate(({ prefix }) => {
      const grid = document.getElementById(prefix + '_grd_kcpCeckList_body_table');
      if (!grid) return { status: 'no_grid' };

      const trs = Array.from(grid.querySelectorAll('tr'));
      if (trs.length === 0) return { status: 'no_rows' };

      // Identify Law Name from the rows
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
        const descText = tds[16] ? tds[16].innerText.replace(/\s+/g, ' ').trim() : '';

        // Only push rows that represent selectable options
        if (mainCb || typeText) {
          curGroup.rows.push({
            tr,
            rIdx,
            mainCb,
            typeText,
            clauseCb,
            descText
          });
        }
      });

      return {
        status: 'parsed',
        lawName,
        groupCount: groups.length,
        groupsData: groups.map(g => ({
          title: g.title,
          rows: g.rows.map(r => ({
            rIdx: r.rIdx,
            typeText: r.typeText,
            hasMainCb: !!r.mainCb,
            hasClauseCb: !!r.clauseCb,
            desc: r.descText.slice(0, 30)
          }))
        }))
      };
    }, { prefix: SELECTORS.POPUP_PREFIX });

    if (pageResult.status !== 'parsed') {
      console.log(`[Step ${step}] Grid not available, stopping.`);
      break;
    }

    // Evaluate decisions for each group in node/browser
    const stepDecisions = pageResult.groupsData.map(grp => {
      const isApp = isBuildingLawApplicable(pageResult.lawName, grp.title);
      let targetRowIdx = -1;
      let checkClause = false;

      if (isApp) {
        // Preference for Applicable:
        // 1. '적합' / '적 합'
        let target = grp.rows.find(r => r.typeText === '적합' || r.typeText === '적 합' || r.typeText.includes('적합'));
        // 2. '대상' (excluding '비대상', '대상법규아님', '예외대상')
        if (!target) target = grp.rows.find(r => r.typeText === '대상' && !r.typeText.includes('비대상') && !r.typeText.includes('대상법규아님') && !r.typeText.includes('예외대상'));
        // 3. '일반대상'
        if (!target) target = grp.rows.find(r => r.typeText.includes('일반대상'));
        // 4. Fallback
        if (!target) target = grp.rows.find(r => r.typeText === '비대상' || r.typeText.includes('비대상') || r.typeText.includes('대상법규아님'));
        if (!target && grp.rows.length > 0) target = grp.rows[0];

        if (target) {
          targetRowIdx = target.rIdx;
          checkClause = true;
        }
      } else {
        // Preference for Non-Applicable:
        // 1. '대상법규아님'
        let target = grp.rows.find(r => r.typeText === '대상법규아님' || r.typeText.includes('대상법규아님'));
        // 2. '비대상'
        if (!target) target = grp.rows.find(r => r.typeText === '비대상' || r.typeText.includes('비대상'));
        // 3. '예외대상'
        if (!target) target = grp.rows.find(r => r.typeText === '예외대상' || r.typeText.includes('예외대상'));
        // 4. Fallback
        if (!target && grp.rows.length > 0) target = grp.rows[0];

        if (target) {
          targetRowIdx = target.rIdx;
          checkClause = false;
        }
      }

      return {
        groupTitle: grp.title,
        isApp,
        targetRowIdx,
        checkClause
      };
    });

    // Apply checks and save in page
    const applyResult = await page.evaluate(({ prefix, decisions }) => {
      const grid = document.getElementById(prefix + '_grd_kcpCeckList_body_table');
      const trs = Array.from(grid.querySelectorAll('tr'));

      // Apply decisions per group
      decisions.forEach(dec => {
        // Uncheck all rows in this group first except target
        trs.forEach((tr, rIdx) => {
          const tds = tr.querySelectorAll('td');
          if (tds.length < 14) return;
          const col10_txt = tds[10] ? tds[10].innerText.replace(/\s+/g, ' ').trim() : '';
          const col11_txt = tds[11] ? tds[11].innerText.replace(/\s+/g, ' ').trim() : '';
          const subTitle = col10_txt || col11_txt;

          if (subTitle === dec.groupTitle || (!subTitle && dec.groupTitle.startsWith('group_'))) {
            const mainCb = tds[12] ? tds[12].querySelector('input[type=checkbox], input[type=radio]') : null;
            const clauseCb = tds[14] ? tds[14].querySelector('input[type=checkbox], input[type=radio]') : null;

            if (rIdx === dec.targetRowIdx) {
              if (mainCb && !mainCb.checked) mainCb.click();
              if (clauseCb) {
                if (dec.checkClause && !clauseCb.checked) clauseCb.click();
                if (!dec.checkClause && clauseCb.checked) clauseCb.click();
              }
            } else {
              if (mainCb && mainCb.checked) mainCb.click();
              if (clauseCb && clauseCb.checked) clauseCb.click();
            }
          }
        });
      });

      // Click popup save button
      const btnSave = document.getElementById(prefix + '_btn_save');
      if (btnSave) btnSave.click();

      // Check next button state
      const btnNext = document.getElementById(prefix + '_btn_Next') || document.getElementById(prefix + '_btn_next');
      const canGoNext = btnNext && !btnNext.disabled && btnNext.style.display !== 'none';

      return { canGoNext };
    }, { prefix: SELECTORS.POPUP_PREFIX, decisions: stepDecisions });

    const decSummary = stepDecisions.map(d => `[${d.isApp ? '적합/대상' : '대상법규아님'}: ${d.groupTitle}]`).join(' ');
    console.log(`✓ [건축물 ${step}/${totalSteps}] ${pageResult.lawName} -> ${decSummary}`);

    if (!applyResult.canGoNext || step === totalSteps) {
      console.log(`\n건축물관련 체크리스트 마지막 항목 (${step}) 도달.`);
      break;
    }

    // Click Next
    await page.evaluate((prefix) => {
      const btnNext = document.getElementById(prefix + '_btn_Next') || document.getElementById(prefix + '_btn_next');
      if (btnNext) btnNext.click();
    }, SELECTORS.POPUP_PREFIX);

    await new Promise(r => setTimeout(r, 400));
  }

  // Close popup and save main page
  console.log('\n팝업창 닫기 및 메인 체크리스트 저장 중...');
  await page.evaluate(({ popPrefix, mainSaveId }) => {
    const btnClose = document.getElementById(popPrefix + '_btn_close') || document.querySelector('.w2window_close');
    if (btnClose) btnClose.click();
    const mainSave = document.getElementById(mainSaveId);
    if (mainSave) mainSave.click();
  }, { popPrefix: SELECTORS.POPUP_PREFIX, mainSaveId: SELECTORS.MAIN_SAVE_BTN });

  await new Promise(r => setTimeout(r, 1500));
  console.log('================================================================');
  console.log('✅ [완료] 건축물관련 체크리스트 (총 107개 항목) 작성 완료!');
  console.log('================================================================\n');
}

module.exports = { runBuildingChecklist, isBuildingLawApplicable };

if (require.main === module) {
  runBuildingChecklist().catch(console.error);
}
