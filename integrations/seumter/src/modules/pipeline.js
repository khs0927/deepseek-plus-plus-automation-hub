const { getSeumterPage } = require('../utils/browser');
const { runAllChecklists } = require('./checklist_all');
const { handlePermitInspectionSign } = require('./permit_inspection');

/**
 * 세움터 인허가 신청서 전체 자동화 원클릭 파이프라인
 * 1. 기본개요 입력 & 저장
 * 2. 동별 및 층별개요 기존건축물 연동 & 저장
 * 3. 허가조서 및 검사조서 작성
 * 4. 한국건축규정 체크리스트 (154개) 전수 작성
 */
async function runFullPipeline(projectData = {}) {
  console.log('====================================================');
  console.log('🚀 세움터 건축행정 전체 원클릭 자동화 파이프라인 시작');
  console.log('====================================================');

  const { page } = await getSeumterPage();

  // ----------------------------------------------------
  // STEP 1: [기본개요] 탭 작성 및 저장
  // ----------------------------------------------------
  console.log('\n[STEP 1/4] [기본개요] 탭 작성 중...');
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '기본개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate((data) => {
    // 하수처리시설 dataList
    const dListWclf = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpWclf') || $p.data.mf_wfm_selfgovn_content_ds_KcpWclf;
    if (dListWclf) {
      if (dListWclf.setCellData) {
        dListWclf.setCellData(0, 'wclfModeNm', data.wclfModeNm || '단독정화조(부패탱크방법)');
        dListWclf.setCellData(0, 'wclfModeCd', '2001');
        dListWclf.setCellData(0, 'capaPsper', String(data.wclfCapa || '340'));
        dListWclf.setCellData(0, 'reprYn', '1');
        dListWclf.setCellData(0, 'rowStatus', 'C');
      }
    }

    // 대수선개요 dataList
    const dListImprpr = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpImprpr') || $p.data.mf_wfm_selfgovn_content_ds_KcpImprpr;
    if (dListImprpr) {
      if (dListImprpr.setCellData) {
        dListImprpr.setCellData(0, 'imprprGbNm', '주계단·피난계단 또는 특별피난계단을 증설 또는 해체하거나 수선 또는 변경하는 것');
        dListImprpr.setCellData(0, 'imprprGbCd', '04');
        dListImprpr.setCellData(0, 'imprprChangGbNm', '신설');
        dListImprpr.setCellData(0, 'imprprChangGbCd', '01');
        dListImprpr.setCellData(0, 'imprprCntt', data.daesuseonText || '지상 2층~3층 직통계단 신설에 따른 계단 대수선');
        dListImprpr.setCellData(0, 'rowStatus', 'C');
      }
    }

    // 전체개요 (시공기간)
    const dListArch = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpArchPms') || $p.data.mf_wfm_selfgovn_content_ds_KcpArchPms;
    if (dListArch && dListArch.set) dListArch.set('constPrdYycnt', '1');

    // UI 총용량 필드
    const txtSum = document.getElementById('mf_wfm_selfgovn_content_txt_KcpWclf_capaNumpsCntSum');
    if (txtSum) txtSum.value = String(data.wclfCapa || '340');

    // 하단 저장
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave');
    if (bottomSave) bottomSave.click();
  }, projectData);

  await new Promise(r => setTimeout(r, 2000));
  console.log('✅ [기본개요] 작성 및 저장 완료!');

  // ----------------------------------------------------
  // STEP 2: [동별 및 층별개요] 탭 자동 전환 및 기존건축물 연동
  // ----------------------------------------------------
  console.log('\n[STEP 2/4] [동별 및 층별개요] 탭으로 자동 이동 및 기존건축물 연동 중...');
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '동별 및 층별개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  // 기존건축물선택 팝업 호출 및 선택
  await page.evaluate(() => {
    const btnExist = Array.from(document.querySelectorAll('button, input, a')).find(el => (el.innerText || el.value || '').trim() === '기존건축물선택');
    if (btnExist) btnExist.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    const pop = document.querySelector('.w2window');
    if (pop) {
      const targetTr = Array.from(pop.querySelectorAll('tr')).find(tr => tr.innerText.includes('1,056') || tr.innerText.includes('주건축물'));
      if (targetTr) {
        const cb = targetTr.querySelector('input[type=checkbox]');
        if (cb && !cb.checked) cb.click();
      }
      const btnSelect = Array.from(pop.querySelectorAll('input, button, a')).find(b => (b.value || b.innerText || '').trim() === '선택');
      if (btnSelect) btnSelect.click();
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // 동별개요 저장
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input, a')).filter(el => (el.innerText || el.value || '').trim() === '저장');
    if (btns.length > 0) btns[0].click();
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave');
    if (bottomSave) bottomSave.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  console.log('✅ [동별 및 층별개요] 기존 건축물 정상 연동 및 저장 완료!');

  // ----------------------------------------------------
  // STEP 3: [허가조서및검사조서] 탭 자동 전환
  // ----------------------------------------------------
  console.log('\n[STEP 3/4] [허가조서및검사조서] 탭으로 자동 이동 중...');
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim().includes('허가조서'));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  console.log('✅ [허가조서및검사조서] 탭 진입 완료!');

  // ----------------------------------------------------
  // STEP 4: [한국건축규정 체크리스트] 탭 자동 전환 및 154개 작성
  // ----------------------------------------------------
  console.log('\n[STEP 4/4] [한국건축규정 체크리스트] 탭으로 자동 이동 및 154개 전수 작성 시작...');
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim().includes('한국건축규정'));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  await runAllChecklists();
  console.log('\n🎉 전체 세움터 인허가 신청서 파이프라인이 성공적으로 완료되었습니다!');
}

module.exports = { runFullPipeline };
if (require.main === module) runFullPipeline().catch(console.error);
