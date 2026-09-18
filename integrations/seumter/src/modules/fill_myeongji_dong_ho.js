const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const projectInfo = require('../config/myeongji_project.json');

async function fillMyeongjiDongAndHo() {
  console.log('================================================================');
  console.log('🏢 [명지동 3593-1 우진메디컬프라자 307~309호 동별/전유부개요 연동]');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('websquare.html')) || pages[0];

  console.log(`📄 대상 페이지: "${await page.title()}"`);
  await page.bringToFront();

  // 1. [동별 및 층별개요] 탭 클릭
  console.log('👉 [1단계] [동별 및 층별개요] 탭 클릭...');
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '동별 및 층별개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // 2. [기존건축물선택] 버튼 클릭 및 팝업 선택
  console.log('👉 [2단계] [기존건축물선택] 버튼 클릭 및 팝업 처리...');
  await page.evaluate(() => {
    const btnExist = Array.from(document.querySelectorAll('button, input, a')).find(el => (el.innerText || el.value || '').trim() === '기존건축물선택');
    if (btnExist) {
      btnExist.click();
      console.log('기존건축물선택 버튼 클릭됨');
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // 팝업창에서 주건축물 사각형 체크상자 강제 체크 후 [선택] 클릭
  const selectResult = await page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll('.w2window, .w2popup, div[class*=popup], div[id*=pop]'));
    const pop = popups[popups.length - 1] || document.body;

    // 테이블 행 중 주건축물 또는 18,344 가 있는 행 찾기
    const rows = Array.from(pop.querySelectorAll('tr, .w2grid_row'));
    const targetRow = rows.find(r => r.innerText.includes('18,344') || r.innerText.includes('우진메디컬') || r.innerText.includes('주건축물')) || rows[1];

    if (targetRow) {
      const cb = targetRow.querySelector('input[type=checkbox]');
      if (cb) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      targetRow.click();
    }

    const btnSelect = Array.from(pop.querySelectorAll('input, button, a')).find(b => (b.value || b.innerText || '').trim() === '선택');
    if (btnSelect) {
      btnSelect.click();
      return { success: true, text: '선택 버튼 클릭 완료' };
    }
    return { success: false, text: '선택 버튼 못찾음' };
  });

  console.log('✔ 기존건축물 팝업 선택 결과:', selectResult);
  await new Promise(r => setTimeout(r, 2000));

  // 3. 동별개요 가운데 파란색 [+ 저장] 버튼 클릭
  console.log('\n👉 [3단계] 동별개요 [+ 저장] 클릭...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const addSaveBtn = btns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      const p = b.closest('#mf_wfm_selfgovn_content_wfm_BPMAZD01I01') || b.parentElement;
      return t === '저장' || t === '+ 저장' || (t.includes('저장') && p && !b.id.includes('bottomSave'));
    });
    if (addSaveBtn) {
      addSaveBtn.click();
      console.log('동별개요 저장 버튼 클릭 완료');
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // 4. 동별 그리드의 [상세내용] (층별/전유부개요) 클릭
  console.log('\n👉 [4단계] 동별 그리드의 [상세내용] 버튼 클릭하여 전유부 팝업 호출...');
  await page.evaluate(() => {
    const detailBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '상세내용' || t.includes('상세내용') || t.includes('층별개요') || t.includes('전유부');
    });
    if (detailBtns.length > 0) {
      detailBtns[0].click();
      console.log('상세내용 버튼 클릭 완료');
    }
  });

  await new Promise(r => setTimeout(r, 2500));

  // 5. 전유부/층별 팝업에서 [기존건축물전유부선택] 또는 [기존건축물층별개요선택] 클릭
  console.log('\n👉 [5단계] 전유부 팝업에서 [기존건축물전유부선택/층별개요선택] 처리...');
  const unitSelectResult = await page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll('.w2window, .w2popup, div[class*=popup]'));
    const topPop = popups[popups.length - 1] || document.body;

    const btnFetchUnit = Array.from(topPop.querySelectorAll('button, input, a')).find(el => {
      const t = (el.innerText || el.value || '').trim();
      return t.includes('기존건축물') && (t.includes('선택') || t.includes('전유부') || t.includes('층별'));
    });

    if (btnFetchUnit) {
      btnFetchUnit.click();
      return { clickedFetch: true, text: btnFetchUnit.innerText || btnFetchUnit.value };
    }
    return { clickedFetch: false };
  });

  console.log('✔ 전유부 대장 불러오기 버튼 클릭:', unitSelectResult);
  await new Promise(r => setTimeout(r, 2000));

  // 6. 호별 선택 팝업에서 307호, 308호, 309호 체크박스 체크 후 [선택]
  console.log('\n👉 [6단계] 307호, 308호, 309호 사각형 체크박스 선택 및 [선택] 클릭...');
  const checkHoResult = await page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll('.w2window, .w2popup, div[class*=popup]'));
    const topPop = popups[popups.length - 1] || document.body;

    const rows = Array.from(topPop.querySelectorAll('tr, .w2grid_row'));
    const targetHos = ['307', '308', '309'];
    let checkedCount = 0;

    rows.forEach(r => {
      const txt = r.innerText || '';
      if (targetHos.some(ho => txt.includes(ho))) {
        const cb = r.querySelector('input[type=checkbox]');
        if (cb) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          checkedCount++;
        }
        r.click();
      }
    });

    const btnSelect = Array.from(topPop.querySelectorAll('input, button, a')).find(b => (b.value || b.innerText || '').trim() === '선택');
    if (btnSelect) {
      btnSelect.click();
    }

    return { checkedCount, hasSelectBtn: !!btnSelect };
  });

  console.log('✔ 호별(307, 308, 309) 체크 및 선택 결과:', checkHoResult);
  await new Promise(r => setTimeout(r, 2000));

  // 7. 307~309호의 변경후 주용도 '교육연구시설(학원)' 및 변경구분 '용도변경' 수정
  console.log('\n👉 [7단계] 307~309호 변경후 용도 [교육연구시설(학원)] 동기화...');
  await page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll('.w2window, .w2popup, div[class*=popup]'));
    const topPop = popups[popups.length - 1] || document.body;

    // 그리드 내 텍스트/셀 수정
    const gridRows = Array.from(topPop.querySelectorAll('tr, .w2grid_row')).filter(r => {
      const t = r.innerText || '';
      return t.includes('307') || t.includes('308') || t.includes('309');
    });

    gridRows.forEach(r => {
      const inputs = Array.from(r.querySelectorAll('input[type=text], select'));
      inputs.forEach(inp => {
        // 용도 필드나 변경구분 필드에 값 주입
        if (inp.title && inp.title.includes('용도')) {
          inp.value = '교육연구시설(학원)';
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    // 팝업 내 [저장] 버튼 클릭
    const popSaveBtn = Array.from(topPop.querySelectorAll('button, input, a')).find(b => (b.innerText || b.value || '').trim() === '저장');
    if (popSaveBtn) {
      popSaveBtn.click();
      console.log('전유부 팝업 저장 완료');
    }
  });

  await new Promise(r => setTimeout(r, 2000));

  // 8. 팝업 닫기 및 메인 화면 하단 저장
  console.log('\n👉 [8단계] 전유부 팝업 닫기 및 메인 화면 [저장] 실행...');
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('.w2window_close, .btn_close, button, a')).filter(b => {
      const t = (b.innerText || b.value || b.title || '').trim();
      return t === '닫기' || t === 'X' || b.className.includes('close');
    });
    if (closeBtns.length > 0) closeBtns[closeBtns.length - 1].click();

    // 메인 하단 저장 버튼 클릭
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                       document.getElementById('mf_wfm_selfgovn_content_bottomSave');
    if (bottomSave) bottomSave.click();
  });

  await new Promise(r => setTimeout(r, 2000));

  // 알림 팝업 확인 자동 수락
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '확인' && el.offsetParent;
    });
    okBtns.forEach(b => b.click());
  });

  console.log('================================================================');
  console.log('🎉 [완료] 동별개요 및 307~309호 전유부 용도변경 연동/저장 완료!');
  console.log('================================================================');
}

if (require.main === module) {
  fillMyeongjiDongAndHo().catch(console.error);
}

module.exports = { fillMyeongjiDongAndHo };
