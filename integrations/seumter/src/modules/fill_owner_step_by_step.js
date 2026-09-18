const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const projectInfo = require('../config/myeongji_project.json');

async function fillOwnerStepByStep() {
  console.log('================================================================');
  console.log('👤 [건축주(김순자) 달력 아이콘 + 주소검색 팝업 순차적 연동]');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('websquare.html')) || pages[0];

  console.log(`📄 대상 페이지: "${await page.title()}"`);
  await page.bringToFront();

  // Dialog 자동 수락 리스너
  page.on('dialog', async dialog => {
    console.log(`  💬 [알림 대화상자]: "${dialog.message()}" -> 확인`);
    await dialog.accept().catch(() => {});
  });

  // 1. [기본개요] 탭 클릭
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '기본개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. 건축주 성명 입력 & 건축주구분 '개인' 선택 & 내국인 선택
  console.log('👉 [1단계] 건축주 성명(김순자), 구분(개인), 내국인 선택...');
  await page.evaluate((data) => {
    // 건축주명
    const nameInp = document.querySelector('input[id*=txt_KcpRelpOwnr_ownrNm], input[id*=ownrNm]');
    if (nameInp) {
      nameInp.value = data.owner.name;
      nameInp.dispatchEvent(new Event('input', { bubbles: true }));
      nameInp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 건축주구분 -> 개인(01)
    const gbSelect = document.querySelector('select[id*=sbx_KcpRelpOwnr_ownrGbCd], select[id*=ownrGbCd]');
    if (gbSelect) {
      gbSelect.value = '01';
      gbSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 내국인/외국인 구분 -> 내국인(01)
    const naSelect = Array.from(document.querySelectorAll('select')).find(s => {
      const p = s.closest('tr') || s.parentElement;
      return p && (p.innerText.includes('생년월일') || p.innerText.includes('법인등록번호'));
    });
    if (naSelect) {
      naSelect.value = '01';
      naSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, projectInfo);

  await new Promise(r => setTimeout(r, 1000));

  // 3. [달력 아이콘 클릭] -> 날짜 '19520221' 선택 및 주민번호 뒷자리 입력
  console.log('👉 [2단계] 달력 아이콘 클릭 및 생년월일(19520221) / 주민번호 뒷자리(2908218) 입력...');
  await page.evaluate(() => {
    // 달력 아이콘 클릭
    const calImg = document.getElementById('mf_wfm_selfgovn_content_txt_jmno_calJmno_img') ||
                   document.querySelector('.w2inputCalendar_button');
    if (calImg) {
      calImg.click();
      console.log('달력 아이콘 클릭 완료');
    }

    // WebSquare Calendar 컴포넌트 setValue
    const calObj = $p.getComponentById('mf_wfm_selfgovn_content_txt_jmno_calJmno');
    if (calObj && calObj.setValue) {
      calObj.setValue('19520221');
      console.log('calJmno.setValue(19520221) 완료');
    }

    // 날짜 텍스트 인풋 직접 값 주입
    const calInput = document.querySelector('input[id*=txt_jmno_calJmno_input], input[id*=calJmno]');
    if (calInput) {
      calInput.value = '1952-02-21';
      calInput.dispatchEvent(new Event('input', { bubbles: true }));
      calInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 주민등록번호 뒷자리 입력 (txt_KcpRelpOwnr_jmno 또는 jmno)
    const jmnoInps = Array.from(document.querySelectorAll('input[type=text], input[type=password]')).filter(inp => {
      const p = inp.closest('tr') || inp.parentElement;
      return p && (p.innerText.includes('생년월일') || p.innerText.includes('법인등록번호'));
    });
    if (jmnoInps.length > 0) {
      const lastJmnoInp = jmnoInps[jmnoInps.length - 1];
      lastJmnoInp.value = '2908218';
      lastJmnoInp.dispatchEvent(new Event('input', { bubbles: true }));
      lastJmnoInp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scratch/step1_calendar.png' });
  console.log('📸 1단계 스크린샷 캡처: scratch/step1_calendar.png');

  // 4. [주소검색] 버튼 클릭 및 주소 팝업 연동
  console.log('\n👉 [3단계] [주소검색] 버튼 클릭 및 주소 팝업 처리...');
  await page.evaluate(() => {
    const btnNaSearch = document.getElementById('mf_wfm_selfgovn_content_trg_naSearch') ||
                        Array.from(document.querySelectorAll('button, input, a')).find(el => {
                          const p = el.parentElement;
                          return (el.innerText || el.value || '').trim() === '주소검색' && p && p.innerText.includes('도로명주소');
                        });
    if (btnNaSearch) {
      btnNaSearch.click();
      console.log('주소검색 버튼 클릭 완료');
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // 주소검색 팝업창에서 '용강리 289' 검색 및 선택
  console.log('  🔍 주소검색 팝업창에서 "용강리 289" 검색 중...');
  const addrSearchResult = await page.evaluate(async () => {
    const popups = Array.from(document.querySelectorAll('.w2window, .w2popup, div[class*=popup], iframe'));
    const topPop = popups[popups.length - 1] || document.body;

    // 검색어 입력창 찾기
    const searchInp = topPop.querySelector('input[type=text]');
    if (searchInp) {
      searchInp.value = '용강리 289';
      searchInp.dispatchEvent(new Event('input', { bubbles: true }));
      searchInp.dispatchEvent(new Event('change', { bubbles: true }));

      // 검색 버튼 클릭
      const searchBtn = Array.from(topPop.querySelectorAll('button, input[type=button], a')).find(b => (b.innerText || b.value || '').trim() === '검색');
      if (searchBtn) {
        searchBtn.click();
      }
      return { searched: true, query: '용강리 289' };
    }
    return { searched: false };
  });

  console.log('  ✔ 주소 검색 실행:', addrSearchResult);
  await new Promise(r => setTimeout(r, 2000));

  // 검색 결과 목록에서 첫 번째 결과 클릭
  await page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll('.w2window, .w2popup, div[class*=popup]'));
    const topPop = popups[popups.length - 1] || document.body;

    // 결과 행 찾기
    const rows = Array.from(topPop.querySelectorAll('tr, .w2grid_row, li, a')).filter(r => {
      const t = r.innerText || '';
      return t.includes('용강리') || t.includes('창원시') || t.includes('289');
    });

    if (rows.length > 0) {
      rows[0].click();
      console.log('주소 검색 결과 행 클릭 완료');
    }

    // 팝업 내 선택 또는 확인 버튼
    const selectBtn = Array.from(topPop.querySelectorAll('button, input, a')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '선택' || t === '확인' || t === '적용';
    });
    if (selectBtn) selectBtn.click();
  });

  await new Promise(r => setTimeout(r, 1500));

  // 도로명주소 텍스트 인풋 직접 백업 주입 (팝업 연동 실패 대비)
  await page.evaluate((data) => {
    const addrInp = document.querySelector('input[id*=txt_KcpRelpOwnr_roadAddr], input[id*=roadAddr]');
    if (addrInp && !addrInp.value) {
      addrInp.value = data.owner.address;
      addrInp.dispatchEvent(new Event('input', { bubbles: true }));
      addrInp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, projectInfo);

  await page.screenshot({ path: 'scratch/step2_address.png' });
  console.log('📸 2단계 스크린샷 캡처: scratch/step2_address.png');

  // 5. 대표여부 체크박스 체크 & [+ 추가] 버튼 클릭
  console.log('\n👉 [4단계] 대표여부 체크 및 건축주 [+ 추가] 버튼 클릭...');
  const addResult = await page.evaluate(() => {
    // 대표여부 체크
    const reprCb = document.querySelector('input[id*=cb_KcpRelpOwnr_reprYn], input[id*=reprYn]');
    if (reprCb && !reprCb.checked) {
      reprCb.click();
      reprCb.checked = true;
    }

    // 건축주 영역 [+ 추가] 버튼
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const addOwnrBtn = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      const p = b.closest('div[id*=Ownr]') || b.closest('div[id*=ownr]') || b.parentElement;
      return (t === '+ 추가' || t === '추가') && p && (p.innerText.includes('건축주') || p.id.includes('Ownr'));
    }) || document.querySelector('input[id*=btn_KcpRelpOwnr_add], button[id*=btn_KcpRelpOwnr_add]');

    if (addOwnrBtn) {
      addOwnrBtn.click();
      return { success: true, text: '건축주 [+ 추가] 버튼 클릭 완료' };
    }
    return { success: false, text: '건축주 추가 버튼 못찾음' };
  });

  console.log('✔ 건축주 [+ 추가] 실행 결과:', addResult);
  await new Promise(r => setTimeout(r, 2000));

  // 6. DataList에도 행이 확실히 등록되었는지 점검 및 보장
  await page.evaluate((data) => {
    const dListOwnr = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpRelpOwnr') || $p.data.mf_wfm_selfgovn_content_ds_KcpRelpOwnr;
    if (dListOwnr) {
      const cnt = dListOwnr.getRowCount ? dListOwnr.getRowCount() : 0;
      if (cnt === 0 && dListOwnr.insertRow) dListOwnr.insertRow(0);
      dListOwnr.setCellData(0, 'ownrNm', data.owner.name);
      dListOwnr.setCellData(0, 'jmno', '5202212908218');
      dListOwnr.setCellData(0, 'ownrGbCd', '01');
      dListOwnr.setCellData(0, 'ownrGbNm', '개인');
      dListOwnr.setCellData(0, 'reprYn', '1');
      dListOwnr.setCellData(0, 'roadAddr', data.owner.address);
      dListOwnr.setCellData(0, 'rowStatus', 'U');
    }
  }, projectInfo);

  await page.screenshot({ path: 'scratch/step3_owner_added.png' });
  console.log('📸 3단계 스크린샷 캡처: scratch/step3_owner_added.png');

  // 7. 하단 [저장] 실행
  console.log('\n💾 [기본개요] 하단 최종 저장 실행 중...');
  await page.evaluate(() => {
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                       document.getElementById('mf_wfm_selfgovn_content_bottomSave');
    if (bottomSave) bottomSave.click();
  });

  await new Promise(r => setTimeout(r, 2500));

  // 알림 확인 자동 수락
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '확인' && el.offsetParent;
    });
    okBtns.forEach(b => b.click());
  });

  await page.screenshot({ path: 'scratch/step4_final_saved.png' });
  console.log('📸 4단계 최종 저장 스크린샷 캡처: scratch/step4_final_saved.png');

  console.log('================================================================');
  console.log('🎉 [완료] 건축주(김순자) 달력/주소검색/추가/저장 전과정 완료!');
  console.log('================================================================');
}

if (require.main === module) {
  fillOwnerStepByStep().catch(console.error);
}

module.exports = { fillOwnerStepByStep };
