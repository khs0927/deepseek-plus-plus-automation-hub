const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const projectInfo = require('../config/myeongji_project.json');

async function fillMyeongjiOverview() {
  console.log('================================================================');
  console.log('📝 [명지동 3593-1 우진메디컬프라자 307~309호 기본개요 자동 입력]');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('websquare.html')) || pages[0];

  console.log(`📄 대상 페이지: "${await page.title()}"`);
  await page.bringToFront();

  // 1. [기본개요] 탭 클릭 확인
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '기본개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. DataList 및 UI 필드 데이터 주입
  const result = await page.evaluate((data) => {
    const logs = [];

    // A. [집합/일반 구분] -> '집합' (02)
    const dListRecp = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpRecp') || $p.data.mf_wfm_selfgovn_content_ds_KcpRecp;
    if (dListRecp && dListRecp.set) {
      dListRecp.set('bldGbCd', '02');
      logs.push('✔ [집합/일반 구분]: 집합건축물(02) 설정 완료');
    }
    const rdoJiphap = Array.from(document.querySelectorAll('input[type=radio]')).find(r => {
      const p = r.parentElement;
      return (p && p.innerText.includes('집합')) || r.value === '02';
    });
    if (rdoJiphap) {
      rdoJiphap.click();
      rdoJiphap.checked = true;
    }

    // B. [건축주 (소유자: 김순자)]
    const dListOwnr = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpRelpOwnr') || $p.data.mf_wfm_selfgovn_content_ds_KcpRelpOwnr;
    if (dListOwnr && dListOwnr.setCellData) {
      dListOwnr.setCellData(0, 'ownrNm', data.owner.name);
      dListOwnr.setCellData(0, 'jmno', data.owner.residentNo.replace('-', ''));
      dListOwnr.setCellData(0, 'ownrGbCd', '01'); // 개인
      dListOwnr.setCellData(0, 'ownrGbNm', '개인');
      dListOwnr.setCellData(0, 'reprYn', '1');
      dListOwnr.setCellData(0, 'roadAddr', data.owner.address);
      dListOwnr.setCellData(0, 'rowStatus', 'U');
      logs.push(`✔ [건축주 입력]: ${data.owner.name} (${data.owner.residentNo}) / ${data.owner.address}`);
    }

    // 건축주 DOM 필드 직접 동기화
    const nameInp = document.querySelector('input[id*=txt_KcpRelpOwnr_ownrNm], input[id*=ownrNm]');
    if (nameInp) nameInp.value = data.owner.name;

    const jmnoInp = document.querySelector('input[id*=txt_KcpRelpOwnr_jmno], input[id*=jmno]');
    if (jmnoInp) jmnoInp.value = data.owner.residentNo;

    const addrInp = document.querySelector('input[id*=txt_KcpRelpOwnr_roadAddr], input[id*=roadAddr]');
    if (addrInp) addrInp.value = data.owner.address;

    // C. [설계자 정보 로드]
    // 1) 사업자등록번호 입력
    const bizInp = Array.from(document.querySelectorAll('input[type=text]')).find(inp => {
      const p = inp.closest('tr') || inp.parentElement;
      return p && p.innerText.includes('설계자') && p.innerText.includes('사업자') && p.innerText.includes('등록번호');
    }) || document.querySelector('input[id*=txt_KcpRelpDsgnr_bsnmRegistNo]');

    if (bizInp) {
      bizInp.value = '604-08-99164';
      bizInp.dispatchEvent(new Event('input', { bubbles: true }));
      bizInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push('✔ [설계자 사업자등록번호]: 604-08-99164 입력 완료');
    }

    // 2) [불러오기] / [협회 회원번호 불러오기] 버튼 클릭
    const btnFetch = Array.from(document.querySelectorAll('button, input, a')).find(el => {
      const t = (el.innerText || el.value || '').trim();
      const p = el.parentElement;
      return (t.includes('불러오기') || t.includes('회원번호')) && p && (p.innerText.includes('설계자') || p.innerText.includes('회원번호'));
    });
    if (btnFetch) {
      btnFetch.click();
      logs.push('✔ [설계자 협회 회원번호 불러오기] 버튼 클릭 실행');
    }

    // D. [대지조건]
    const dListPlat = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpPlatLc') || $p.data.mf_wfm_selfgovn_content_ds_KcpPlatLc;
    if (dListPlat && dListPlat.setCellData) {
      dListPlat.setCellData(0, 'platPlc', data.location.sido + ' ' + data.location.sigungu + ' ' + data.location.bjdong + ' ' + data.location.bunji);
      dListPlat.setCellData(0, 'sigunguCd', '26440');
      dListPlat.setCellData(0, 'bjdongCd', '10400');
      dListPlat.setCellData(0, 'bun', '3593');
      dListPlat.setCellData(0, 'ji', '0001');
      dListPlat.setCellData(0, 'jimokNm', '대');
      dListPlat.setCellData(0, 'jimokCd', '08');
      dListPlat.setCellData(0, 'reprYn', '1');
      dListPlat.setCellData(0, 'rowStatus', 'U');
      logs.push('✔ [대지조건]: 부산광역시 강서구 명지동 3593-1 (지목: 대) 설정 완료');
    }

    // E. [전체개요 (대장 1:1 일치)]
    const dListArch = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpArchPms') || $p.data.mf_wfm_selfgovn_content_ds_KcpArchPms;
    if (dListArch && dListArch.set) {
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
      logs.push('✔ [전체개요]: 대지 2539㎡, 건축 1515.0088㎡, 연면적 18344.1491㎡, 주용도 및 층수(지하2/지상10) 설정 완료');
    }

    // F. [주차장]
    const dListPklot = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpPklot') || $p.data.mf_wfm_selfgovn_content_ds_KcpPklot;
    if (dListPklot && dListPklot.set) {
      dListPklot.set('indrAutoUtcnt', '144');
      dListPklot.set('indrAutoArea', '1675.8');
      logs.push('✔ [주차장]: 옥내 자주식 144대 (1,675.8㎡) 설정 완료');
    }

    return logs;
  }, projectInfo);

  console.log('\n[데이터 주입 결과]:');
  result.forEach(l => console.log('  ' + l));

  await new Promise(r => setTimeout(r, 1500));

  // 3. 하단 [저장] 버튼 클릭
  console.log('\n💾 [기본개요] 저장 진행 중...');
  await page.evaluate(() => {
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                       document.getElementById('mf_wfm_selfgovn_content_bottomSave') ||
                       document.querySelector('.btn_save, button[id*=bottomSave]');
    if (bottomSave) {
      bottomSave.click();
      console.log('저장 버튼 클릭 완료');
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // 알림 팝업 자동 확인
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '확인' && el.offsetParent;
    });
    okBtns.forEach(b => b.click());
  });

  console.log('================================================================');
  console.log('🎉 [완료] 명지동 3593-1 기본개요 작성 및 저장이 완료되었습니다!');
  console.log('================================================================');
}

if (require.main === module) {
  fillMyeongjiOverview().catch(console.error);
}

module.exports = { fillMyeongjiOverview };
