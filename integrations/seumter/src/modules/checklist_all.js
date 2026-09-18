const { runBuildingChecklist } = require('./checklist_building');
const { runLocationChecklist } = require('./checklist_location');
const { getSeumterPage } = require('../utils/browser');

async function runAllChecklists() {
  console.log('================================================================');
  console.log('🚀 [한국건축규정 156개 체크리스트 전수 작성] 자동화 파이프라인 시작');
  console.log('📋 대상: 명지동 3593-1 우진메디컬프라자 307~309호 용도변경');
  console.log('🏢 공사 유형: 근린생활시설 ➔ 교육연구시설(학원) 용도변경허가 (361.0038㎡)');
  console.log('================================================================\n');

  // Step 1: Building Checklist (107 items)
  console.log('▶️ [1단계] 건축물관련 체크리스트 (107개 항목) 작성 시작...');
  await runBuildingChecklist();

  await new Promise(r => setTimeout(r, 2000));

  // Step 2: Location Checklist (49 items)
  console.log('▶️ [2단계] 입지관련 체크리스트 (49개 항목) 작성 시작...');
  await runLocationChecklist();

  await new Promise(r => setTimeout(r, 2000));

  // Step 3: Final Verification
  console.log('▶️ [3단계] 최종 작성 상태 및 완료 건수 검증...');
  const { page } = await getSeumterPage();
  const summary = await page.evaluate(() => {
    const bldSpan = document.getElementById('mf_wfm_selfgovn_content_wfm_BPMAZS01I01_chkListNm');
    const bldText = bldSpan ? bldSpan.innerText : '';

    const lawGrid = document.getElementById('mf_wfm_selfgovn_content_wfm_BPMAZS01I01_grd_lawordCust_body_table');
    const gridRows = lawGrid ? Array.from(lawGrid.querySelectorAll('tr')).map(tr => tr.innerText.replace(/\s+/g, ' ').trim()).filter(t => t.length > 0) : [];

    return {
      bldText,
      gridRows
    };
  });

  console.log('\n================================================================');
  console.log('🎉 [검증 결과]');
  console.log(`- 현재 화면 표시: ${summary.bldText}`);
  console.log(`- 법령 현황 요약: ${summary.gridRows.join(' | ')}`);
  console.log('================================================================\n');
}

module.exports = { runAllChecklists };

if (require.main === module) {
  runAllChecklists().catch(console.error);
}
