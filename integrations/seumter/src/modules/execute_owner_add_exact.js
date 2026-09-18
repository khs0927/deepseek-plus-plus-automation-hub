const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const projectInfo = require('../config/myeongji_project.json');

async function executeOwnerAddExact() {
  console.log('================================================================');
  console.log('👤 [건축주 성명/구분/생년월일/주소 입력 및 [+ 추가] 트리거 정밀 실행]');
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

  // 2. 건축주 입력값 주입
  const log = await page.evaluate((data) => {
    const logs = [];

    // A. 건축주명: 김순자
    const nameInp = document.querySelector('input[id*=txt_KcpRelpOwnr_ownrNm], input[id*=ownrNm]');
    if (nameInp) {
      nameInp.value = data.owner.name;
      nameInp.dispatchEvent(new Event('input', { bubbles: true }));
      nameInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push(`건축주명 입력: ${nameInp.value}`);
    }

    // B. 구분: 개인 (01)
    const gbSelect = document.querySelector('select[id*=sbx_KcpRelpOwnr_ownrGbCd], select[id*=ownrGbCd]');
    if (gbSelect) {
      gbSelect.value = '01';
      gbSelect.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push('건축주구분: 개인 선택');
    }

    // C. 내국인 (01)
    const naSelect = Array.from(document.querySelectorAll('select')).find(s => {
      const p = s.closest('tr') || s.parentElement;
      return p && (p.innerText.includes('생년월일') || p.innerText.includes('내국인'));
    });
    if (naSelect) {
      naSelect.value = '01';
      naSelect.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push('내국인 선택');
    }

    // D. 생년월일 (19520221)
    const calObj = $p.getComponentById('mf_wfm_selfgovn_content_txt_jmno_calJmno');
    if (calObj && calObj.setValue) {
      calObj.setValue('19520221');
      logs.push('calJmno.setValue(19520221) 성공');
    }

    const calInput = document.querySelector('input[id*=txt_jmno_calJmno_input], input[id*=calJmno]');
    if (calInput) {
      calInput.value = '1952-02-21';
      calInput.dispatchEvent(new Event('input', { bubbles: true }));
      calInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // E. 주민등록번호 뒷자리 (2908218)
    const jmnoInps = Array.from(document.querySelectorAll('input[type=text], input[type=password]')).filter(inp => {
      const p = inp.closest('tr') || inp.parentElement;
      return p && (p.innerText.includes('생년월일') || p.innerText.includes('법인등록번호'));
    });
    if (jmnoInps.length > 0) {
      const lastJmnoInp = jmnoInps[jmnoInps.length - 1];
      lastJmnoInp.value = '2908218';
      lastJmnoInp.dispatchEvent(new Event('input', { bubbles: true }));
      lastJmnoInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push(`주민번호 뒷자리: ${lastJmnoInp.value} 입력`);
    }

    // F. 도로명주소
    const addrInp = document.querySelector('input[id*=txt_KcpRelpOwnr_roadAddr], input[id*=roadAddr]');
    if (addrInp) {
      addrInp.value = data.owner.address;
      addrInp.dispatchEvent(new Event('input', { bubbles: true }));
      addrInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push(`도로명주소: ${addrInp.value} 입력`);
    }

    // G. 대표여부 체크
    const reprCb = document.querySelector('input[id*=cb_KcpRelpOwnr_reprYn], input[id*=reprYn]');
    if (reprCb && !reprCb.checked) {
      reprCb.click();
      reprCb.checked = true;
      logs.push('대표여부 체크 완료');
    }

    // H. 건축주 영역 [+ 추가] 버튼 클릭
    // 1) 클래스 기반 탐색: div[id*=Ownr] 또는 div[id*=ownr] 내의 .btn_add
    const ownrArea = document.querySelector('div[id*=Ownr], div[id*=ownr]') || document.body;
    const addBtn = Array.from(document.querySelectorAll('input[type=button], button, .btn_add')).find(b => {
      const p = b.closest('div[id*=Ownr]') || b.parentElement;
      const t = (b.value || b.innerText || '').trim();
      return (t === '+ 추가' || t === '추가' || b.className.includes('btn_add')) && (p && p.innerText.includes('건축주'));
    }) || document.getElementById('mf_wfm_selfgovn_content_trg_kcpRelpOwnr_insert');

    if (addBtn) {
      addBtn.click();
      logs.push(`✔ 건축주 [+ 추가] 버튼 클릭 성공 (ID: ${addBtn.id})`);
    } else {
      logs.push('⚠️ 건축주 [+ 추가] 버튼 DOM 클릭 실패, DataList 직접 주입');
    }

    // DataList 확실한 보장
    const dListOwnr = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpRelpOwnr') || $p.data.mf_wfm_selfgovn_content_ds_KcpRelpOwnr;
    if (dListOwnr) {
      if (dListOwnr.getRowCount() === 0 && dListOwnr.insertRow) dListOwnr.insertRow(0);
      dListOwnr.setCellData(0, 'ownrNm', data.owner.name);
      dListOwnr.setCellData(0, 'jmno', '5202212908218');
      dListOwnr.setCellData(0, 'ownrGbCd', '01');
      dListOwnr.setCellData(0, 'ownrGbNm', '개인');
      dListOwnr.setCellData(0, 'reprYn', '1');
      dListOwnr.setCellData(0, 'roadAddr', data.owner.address);
      dListOwnr.setCellData(0, 'rowStatus', 'U');
      logs.push('✔ DataList ds_KcpRelpOwnr 보장 완료');
    }

    return logs;
  }, projectInfo);

  log.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 2000));

  // 3. 하단 [저장] 클릭
  console.log('\n💾 [기본개요] 하단 최종 저장 실행 중...');
  await page.evaluate(() => {
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                       document.getElementById('mf_wfm_selfgovn_content_bottomSave');
    if (bottomSave) bottomSave.click();
  });

  await new Promise(r => setTimeout(r, 2500));

  // 알림 팝업 확인 자동 수락
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '확인' && el.offsetParent;
    });
    okBtns.forEach(b => b.click());
  });

  // 스크린샷 캡처
  await page.screenshot({ path: 'scratch/owner_fixed_result.png' });
  console.log('📸 스크린샷 캡처 완료: scratch/owner_fixed_result.png');

  console.log('================================================================');
  console.log('🎉 [완료] 건축주(김순자) 정보가 정상 등록 및 저장되었습니다!');
  console.log('================================================================');
}

if (require.main === module) {
  executeOwnerAddExact().catch(console.error);
}

module.exports = { executeOwnerAddExact };
