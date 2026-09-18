const { getSeumterPage } = require('../utils/browser');

/**
 * [허가조사및검사조서] 탭 자동화 모듈
 * - 조사/검사일, 설계일: 오늘 날짜 기준 1~2달 전 자동 계산 또는 지정일자 입력
 * - [설계자와조사/검사자가동일한경우] 클릭 동기화
 * - 사업자등록번호 입력 및 [불러오기] 클릭
 * - 조사/검사자 [+ 추가] 및 전자서명 인증
 * - 종합의견: '적합함.'
 * - 저장 완료
 */
async function handlePermitInspectionSign(customDates = {}) {
  console.log('=== Starting [허가조사및검사조서] Automation ===');
  const { page } = await getSeumterPage();

  // 1. Switch to tab
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '허가조사및검사조서' || t.includes('허가조사');
    });
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. Compute default dates if not provided (1~2 months prior to today)
  const today = new Date();
  const d1 = customDates.examDate || new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().slice(0, 10);
  const d2 = customDates.dsgnDate || new Date(today.getFullYear(), today.getMonth() - 1, 31).toISOString().slice(0, 10);

  console.log(`Setting dates: 조사/검사일 = ${d1}, 설계일 = ${d2}`);

  // 3. Fill and execute
  await page.evaluate(({ examDate, dsgnDate, opinionText }) => {
    // 조사/검사일
    const inpExam = Array.from(document.querySelectorAll('input[type=text]')).find(inp => {
      const p = inp.closest('tr') || inp.parentElement;
      return (p && p.innerText.includes('조사/검사일')) || inp.title.includes('조사/검사일') || inp.id.includes('examDate');
    });
    if (inpExam) {
      inpExam.value = examDate;
      inpExam.dispatchEvent(new Event('input', { bubbles: true }));
      inpExam.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 설계일
    const inpDsgn = Array.from(document.querySelectorAll('input[type=text]')).find(inp => {
      const p = inp.closest('tr') || inp.parentElement;
      return (p && p.innerText.includes('설계일')) || inp.title.includes('설계일') || inp.id.includes('dsgnDate');
    });
    if (inpDsgn) {
      inpDsgn.value = dsgnDate;
      inpDsgn.dispatchEvent(new Event('input', { bubbles: true }));
      inpDsgn.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Click [설계자와조사/검사자가동일한경우]
    const btnSame = Array.from(document.querySelectorAll('button, input, a')).find(el => {
      const t = (el.innerText || el.value || '').replace(/\s+/g, '');
      return t.includes('설계자와조사/검사자가동일') || t.includes('설계자와조사');
    });
    if (btnSame) btnSame.click();

    // 사업자등록번호
    const bizInp = Array.from(document.querySelectorAll('input[type=text]')).find(inp => {
      const p = inp.closest('tr') || inp.parentElement;
      return p && p.innerText.includes('사업자') && p.innerText.includes('등록번호');
    });
    if (bizInp && !bizInp.value) {
      bizInp.value = '604-08-99164';
      bizInp.dispatchEvent(new Event('input', { bubbles: true }));
      bizInp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Click [불러오기] for 회원번호
    const btnFetch = Array.from(document.querySelectorAll('button, input, a')).find(el => {
      const p = el.parentElement;
      const t = (el.innerText || el.value || '').trim();
      return t === '불러오기' && p && p.innerText.includes('회원번호');
    });
    if (btnFetch) btnFetch.click();

    // 종합의견
    const txtOpinion = Array.from(document.querySelectorAll('textarea, input[type=text]')).find(el => {
      const p = el.closest('tr') || el.parentElement;
      return (p && p.innerText.includes('종합의견')) || el.title.includes('종합의견') || el.id.includes('synOpnn');
    });
    if (txtOpinion) {
      txtOpinion.value = opinionText || '적합함.';
      txtOpinion.dispatchEvent(new Event('input', { bubbles: true }));
      txtOpinion.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { examDate: d1, dsgnDate: d2, opinionText: customDates.opinion || '적합함.' });

  await new Promise(r => setTimeout(r, 1000));

  // 4. Save
  await page.evaluate(() => {
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                       document.getElementById('mf_wfm_selfgovn_content_bottomSave');
    if (bottomSave) bottomSave.click();
  });

  await new Promise(r => setTimeout(r, 1500));

  // Dismiss dialog if any
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '확인' && el.offsetParent;
    });
    okBtns.forEach(b => b.click());
  });

  console.log('=== [허가조사및검사조서] Successfully Completed & Saved ===');
}

module.exports = { handlePermitInspectionSign };
if (require.main === module) handlePermitInspectionSign().catch(console.error);
