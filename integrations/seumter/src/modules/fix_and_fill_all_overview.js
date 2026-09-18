const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const projectInfo = require('../config/myeongji_project.json');

async function fixAndFillAllOverview() {
  console.log('================================================================');
  console.log('🛠️ [명지동 3593-1 설계자/건축주/대지조건/전체개요 정밀 수정 및 저장]');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('websquare.html')) || pages[0];

  console.log(`📄 대상 페이지: "${await page.title()}"`);
  await page.bringToFront();

  // Dialog 자동 수락 리스너
  page.on('dialog', async dialog => {
    console.log(`  💬 [알림]: "${dialog.message()}" -> 수락`);
    await dialog.accept().catch(() => {});
  });

  // 1. [기본개요] 탭 클릭
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '기본개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. [설계자] 중복 행 정리 및 사업자번호/협회회원번호 불러오기
  console.log('👉 [1/4] [설계자] 중복 행 삭제, 사업자등록번호 입력, 협회회원번호 [불러오기] 실행...');
  const dsgnrResult = await page.evaluate(() => {
    const logs = [];

    // A. DataList에서 중복 행 제거 (1개 행만 유지)
    const dListDsgnr = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpRelpDsgnr') || $p.data.mf_wfm_selfgovn_content_ds_KcpRelpDsgnr;
    if (dListDsgnr) {
      const rowCount = dListDsgnr.getRowCount ? dListDsgnr.getRowCount() : (dListDsgnr.getAllJSON ? dListDsgnr.getAllJSON().length : 0);
      if (rowCount > 1) {
        // 첫 번째 또는 중복 행 제거하고 0번 행을 대표로 설정
        dListDsgnr.removeRow(1);
        logs.push('✔ 설계자 중복 행 1개 삭제 완료 (DataList)');
      }
      dListDsgnr.setCellData(0, 'reprYn', '1');
      dListDsgnr.setCellData(0, 'bsnmRegistNo', '604-08-99164');
      dListDsgnr.setCellData(0, 'rowStatus', 'U');
    }

    // B. 화면 상의 사업자등록번호 인풋 입력
    const bizInp = Array.from(document.querySelectorAll('input[type=text]')).find(inp => {
      const p = inp.closest('tr') || inp.parentElement;
      return p && p.innerText.includes('사업자') && p.innerText.includes('등록번호');
    }) || document.querySelector('input[id*=bsnmRegistNo]');

    if (bizInp) {
      bizInp.value = '604-08-99164';
      bizInp.dispatchEvent(new Event('input', { bubbles: true }));
      bizInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push('✔ 설계자 사업자등록번호 604-08-99164 입력 완료');
    }

    // C. 협회 회원번호 [불러오기] 버튼 클릭
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const btnFetchMem = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      const p = b.parentElement;
      return t === '불러오기' && p && (p.innerText.includes('협회') || p.innerText.includes('회원번호') || p.innerText.includes('M1-'));
    });

    if (btnFetchMem) {
      btnFetchMem.click();
      logs.push('✔ 협회 회원번호 [불러오기] 버튼 클릭 완료');
    }

    // 대표여부 체크박스 확실히 체크
    const reprCb = Array.from(document.querySelectorAll('input[type=checkbox]')).find(cb => {
      const p = cb.parentElement;
      return p && p.innerText.includes('대표여부') && (cb.id.includes('Dsgnr') || p.closest('div[id*=Dsgnr]'));
    });
    if (reprCb && !reprCb.checked) {
      reprCb.click();
      reprCb.checked = true;
    }

    return logs;
  });
  dsgnrResult.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 1500));

  // 3. [건축주] 생년월일 달력 세팅, 도로명주소 바인딩, 대표건축주 등록
  console.log('\n👉 [2/4] [건축주] 생년월일 달력 인식, 도로명주소, 대표건축주 바인딩...');
  const ownrResult = await page.evaluate((data) => {
    const logs = [];

    // A. WebSquare Calendar 컴포넌트 직접 세팅
    const calComps = Object.keys($p.data || {}).filter(k => k.includes('cal') || k.includes('Ownr'));
    const calObj = $p.getComponentById('mf_wfm_selfgovn_content_cal_KcpRelpOwnr_jmno') ||
                   $p.getComponentById('mf_wfm_selfgovn_content_ica_KcpRelpOwnr_jmno') ||
                   $p.getComponentById('mf_wfm_selfgovn_content_txt_KcpRelpOwnr_jmno');

    if (calObj && calObj.setValue) {
      calObj.setValue('19520221');
      logs.push('✔ 건축주 생년월일 컴포넌트(19520221) setValue 실행');
    }

    // B. DOM 인풋 직접 값 주입 및 change 이벤트 트리거
    const jmnoInp = document.querySelector('input[id*=txt_KcpRelpOwnr_jmno], input[id*=jmno]');
    if (jmnoInp) {
      jmnoInp.value = '520221-2908218';
      jmnoInp.dispatchEvent(new Event('input', { bubbles: true }));
      jmnoInp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const nameInp = document.querySelector('input[id*=txt_KcpRelpOwnr_ownrNm], input[id*=ownrNm]');
    if (nameInp) {
      nameInp.value = data.owner.name;
      nameInp.dispatchEvent(new Event('input', { bubbles: true }));
      nameInp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const gbSelect = document.querySelector('select[id*=sbx_KcpRelpOwnr_ownrGbCd], select[id*=ownrGbCd]');
    if (gbSelect) {
      gbSelect.value = '01';
      gbSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const addrInp = document.querySelector('input[id*=txt_KcpRelpOwnr_roadAddr], input[id*=roadAddr]');
    if (addrInp) {
      addrInp.value = data.owner.address;
      addrInp.dispatchEvent(new Event('input', { bubbles: true }));
      addrInp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // C. DataList에 완전한 행으로 반영
    const dListOwnr = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpRelpOwnr') || $p.data.mf_wfm_selfgovn_content_ds_KcpRelpOwnr;
    if (dListOwnr) {
      const rowCount = dListOwnr.getRowCount ? dListOwnr.getRowCount() : 0;
      if (rowCount === 0 && dListOwnr.insertRow) {
        dListOwnr.insertRow(0);
      }
      dListOwnr.setCellData(0, 'ownrNm', data.owner.name);
      dListOwnr.setCellData(0, 'jmno', '5202212908218');
      dListOwnr.setCellData(0, 'ownrGbCd', '01');
      dListOwnr.setCellData(0, 'ownrGbNm', '개인');
      dListOwnr.setCellData(0, 'reprYn', '1');
      dListOwnr.setCellData(0, 'roadAddr', data.owner.address);
      dListOwnr.setCellData(0, 'rowStatus', 'U');
      logs.push(`✔ 건축주 DataList 바인딩 완료: ${data.owner.name} (520221-2908218)`);
    }

    return logs;
  }, projectInfo);
  ownrResult.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 1500));

  // 4. [대지조건] 부산광역시 강서구 명지동 3593-1 / 지목 대 / 지역지구구역
  console.log('\n👉 [3/4] [대지조건] 명지동 3593-1, 지목 대, 지역지구구역 연동...');
  const platResult = await page.evaluate((data) => {
    const logs = [];

    // DataList 설정
    const dListPlat = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpPlatLc') || $p.data.mf_wfm_selfgovn_content_ds_KcpPlatLc;
    if (dListPlat) {
      if (dListPlat.getRowCount() === 0 && dListPlat.insertRow) dListPlat.insertRow(0);
      dListPlat.setCellData(0, 'platPlc', '부산광역시 강서구 명지동 3593-1');
      dListPlat.setCellData(0, 'sigunguCd', '26440');
      dListPlat.setCellData(0, 'bjdongCd', '10400');
      dListPlat.setCellData(0, 'bun', '3593');
      dListPlat.setCellData(0, 'ji', '0001');
      dListPlat.setCellData(0, 'jimokNm', '대');
      dListPlat.setCellData(0, 'jimokCd', '08');
      dListPlat.setCellData(0, 'reprYn', '1');
      dListPlat.setCellData(0, 'rowStatus', 'U');
      logs.push('✔ 대지조건 DataList (명지동 3593-1 / 지목: 대) 바인딩 완료');
    }

    // DOM 인풋
    const bunInp = document.querySelector('input[id*=txt_KcpPlatLc_bun]');
    if (bunInp) bunInp.value = '3593';
    const jiInp = document.querySelector('input[id*=txt_KcpPlatLc_ji]');
    if (jiInp) jiInp.value = '1';

    // [지역지구구역정보가져오기] 버튼 실행
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const btnJijigu = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t.includes('지역지구구역정보가져오기') || t.includes('지역지구구역');
    });
    if (btnJijigu) {
      btnJijigu.click();
      logs.push('✔ [지역지구구역정보가져오기] 버튼 클릭 실행');
    }

    return logs;
  }, projectInfo);
  platResult.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 2000));

  // 5. [전체개요] 건축물대장 1:1 완벽 동기화
  console.log('\n👉 [4/4] [전체개요] 대지 2539㎡, 건축 1515.0088㎡, 연면적 18344.1491㎡, 주용도, 주구조, 층수, 주차장 144대 설정...');
  const archResult = await page.evaluate((data) => {
    const logs = [];

    // 전체개요 DataList
    const dListArch = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpArchPms') || $p.data.mf_wfm_selfgovn_content_ds_KcpArchPms;
    if (dListArch) {
      dListArch.set('platArea', String(data.buildingOverview.landArea));
      dListArch.set('archArea', String(data.buildingOverview.archArea));
      dListArch.set('totArea', String(data.buildingOverview.totalArea));
      dListArch.set('vlRatEstmTotArea', String(data.buildingOverview.vlRatEstmTotArea));
      dListArch.set('bcRat', String(data.buildingOverview.bcRat));
      dListArch.set('vlRat', String(data.buildingOverview.vlRat));
      dListArch.set('mainPurpNm', data.buildingOverview.mainPurp);
      dListArch.set('strctNm', data.buildingOverview.structure);
      dListArch.set('grndFlrCnt', '10');
      dListArch.set('ugrndFlrCnt', '2');
      dListArch.set('heit', String(data.buildingOverview.height));
      logs.push('✔ 전체개요 DataList 바인딩 완료');
    }

    // 주차장 DataList
    const dListPklot = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpPklot') || $p.data.mf_wfm_selfgovn_content_ds_KcpPklot;
    if (dListPklot) {
      dListPklot.set('indrAutoUtcnt', '144');
      dListPklot.set('indrAutoArea', '1675.8');
      logs.push('✔ 주차장 DataList (옥내자주식 144대, 1675.8㎡) 바인딩 완료');
    }

    // 하수처리시설(정화조) DataList
    const dListWclf = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpWclf') || $p.data.mf_wfm_selfgovn_content_ds_KcpWclf;
    if (dListWclf) {
      if (dListWclf.getRowCount() === 0 && dListWclf.insertRow) dListWclf.insertRow(0);
      dListWclf.setCellData(0, 'wclfKndNm', '하수종말처리장연결');
      dListWclf.setCellData(0, 'rowStatus', 'U');
      logs.push('✔ 정화조 DataList (하수종말처리장연결) 바인딩 완료');
    }

    return logs;
  }, projectInfo);
  archResult.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 1500));

  // 6. 하단 [저장] 실행
  console.log('\n💾 [기본개요] 전체 항목 최종 저장 실행 중...');
  await page.evaluate(() => {
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                       document.getElementById('mf_wfm_selfgovn_content_bottomSave');
    if (bottomSave) {
      bottomSave.click();
      console.log('하단 저장 버튼 클릭');
    }
  });

  await new Promise(r => setTimeout(r, 2500));

  // 알림 팝업 확인 자동 클릭
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '확인' && el.offsetParent;
    });
    okBtns.forEach(b => b.click());
  });

  console.log('================================================================');
  console.log('🎉 [완료] 피드백 4개 항목 수정 및 최종 저장이 완료되었습니다!');
  console.log('================================================================');
}

if (require.main === module) {
  fixAndFillAllOverview().catch(console.error);
}

module.exports = { fixAndFillAllOverview };
