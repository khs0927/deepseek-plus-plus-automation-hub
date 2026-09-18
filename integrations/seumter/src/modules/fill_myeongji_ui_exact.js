const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const projectInfo = require('../config/myeongji_project.json');

async function fillMyeongjiUIExact() {
  console.log('================================================================');
  console.log('✍️ [명지동 3593-1 건축주, 설계자, 대지조건 UI 입력 및 추가 실행]');
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

  // 1. [기본개요] 탭 확실히 클릭
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '기본개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. 건축주 섹션 입력 및 [+ 추가] 실행
  console.log('👉 [1/3] 건축주 (김순자) 입력 및 [+ 추가] 실행...');
  const ownrLog = await page.evaluate((data) => {
    const logs = [];

    // 건축주 성명
    const nameInp = document.querySelector('input[id*=txt_KcpRelpOwnr_ownrNm], input[id*=ownrNm]');
    if (nameInp) {
      nameInp.value = data.owner.name;
      nameInp.dispatchEvent(new Event('input', { bubbles: true }));
      nameInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push(`건축주명 입력: ${nameInp.value}`);
    }

    // 건축주구분 -> '개인' (01)
    const gbSelect = document.querySelector('select[id*=sbx_KcpRelpOwnr_ownrGbCd], select[id*=ownrGbCd]');
    if (gbSelect) {
      gbSelect.value = '01';
      gbSelect.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push('건축주구분: 개인 선택');
    }

    // 주민등록번호
    const jmnoInp = document.querySelector('input[id*=txt_KcpRelpOwnr_jmno], input[id*=jmno]');
    if (jmnoInp) {
      jmnoInp.value = data.owner.residentNo.replace('-', '');
      jmnoInp.dispatchEvent(new Event('input', { bubbles: true }));
      jmnoInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push(`주민등록번호 입력: ${jmnoInp.value}`);
    }

    // 대표여부 체크박스
    const reprCb = document.querySelector('input[id*=cb_KcpRelpOwnr_reprYn], input[id*=reprYn]');
    if (reprCb && !reprCb.checked) {
      reprCb.click();
      reprCb.checked = true;
    }

    // 도로명주소
    const addrInp = document.querySelector('input[id*=txt_KcpRelpOwnr_roadAddr], input[id*=roadAddr]');
    if (addrInp) {
      addrInp.value = data.owner.address;
      addrInp.dispatchEvent(new Event('input', { bubbles: true }));
      addrInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push(`도로명주소 입력: ${addrInp.value}`);
    }

    // 건축주 영역 [+ 추가] 버튼 클릭
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const addOwnrBtn = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      const p = b.closest('div[id*=Ownr]') || b.closest('div[id*=ownr]') || b.parentElement;
      return (t === '+ 추가' || t === '추가') && p && (p.innerText.includes('건축주') || p.id.includes('Ownr'));
    }) || document.querySelector('input[id*=btn_KcpRelpOwnr_add], button[id*=btn_KcpRelpOwnr_add]');

    if (addOwnrBtn) {
      addOwnrBtn.click();
      logs.push('✔ 건축주 [+ 추가] 버튼 클릭 완료');
    }

    return logs;
  }, projectInfo);

  ownrLog.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 1500));

  // 3. 설계자 섹션 [나의정보가져오기] 및 [+ 추가] 실행
  console.log('\n👉 [2/3] 설계자 [나의정보가져오기] 실행...');
  const dsgnrLog = await page.evaluate(() => {
    const logs = [];

    // [나의정보가져오기] 버튼 클릭
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const btnMyInfo = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t.includes('나의정보가져오기') || t.includes('나의정보');
    });

    if (btnMyInfo) {
      btnMyInfo.click();
      logs.push('✔ [나의정보가져오기] 버튼 클릭 실행');
    } else {
      // 대체: 사업자등록번호 입력 및 불러오기
      const bizInp = Array.from(document.querySelectorAll('input[type=text]')).find(inp => {
        const p = inp.closest('tr') || inp.parentElement;
        return p && p.innerText.includes('설계자') && p.innerText.includes('사업자') && p.innerText.includes('등록번호');
      });
      if (bizInp) {
        bizInp.value = '604-08-99164';
        bizInp.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const btnFetch = allBtns.find(b => (b.innerText || b.value || '').trim() === '불러오기');
      if (btnFetch) btnFetch.click();
      logs.push('✔ 설계자 사업자번호 입력 및 불러오기 실행');
    }

    return logs;
  });

  dsgnrLog.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 2000));

  // 설계자 [+ 추가] 버튼 클릭
  await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const addDsgnrBtn = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      const p = b.closest('div[id*=Dsgnr]') || b.closest('div[id*=dsgnr]') || b.parentElement;
      return (t === '+ 추가' || t === '추가') && p && (p.innerText.includes('설계자') || p.id.includes('Dsgnr'));
    }) || document.querySelector('input[id*=btn_KcpRelpDsgnr_add], button[id*=btn_KcpRelpDsgnr_add]');

    if (addDsgnrBtn) {
      addDsgnrBtn.click();
      console.log('설계자 [+ 추가] 버튼 클릭 완료');
    }
  });

  await new Promise(r => setTimeout(r, 1500));

  // 4. 대지조건 섹션 (본번 3593, 부번 1, 지목 대, 지역지구구역정보가져오기, [+ 추가])
  console.log('\n👉 [3/3] 대지조건 (명지동 3593-1 / 지목 대 / 지역지구구역) 입력 및 [+ 추가] 실행...');
  const platLog = await page.evaluate((data) => {
    const logs = [];

    // 본번 / 부번 인풋 찾기
    const bunInps = Array.from(document.querySelectorAll('input[type=text]')).filter(inp => {
      const p = inp.closest('tr') || inp.parentElement;
      return p && p.innerText.includes('대지위치') || inp.id.includes('bun') || inp.id.includes('ji');
    });

    const bunInp = document.querySelector('input[id*=txt_KcpPlatLc_bun], input[id*=bun]') || bunInps[bunInps.length - 2];
    const jiInp = document.querySelector('input[id*=txt_KcpPlatLc_ji], input[id*=ji]') || bunInps[bunInps.length - 1];

    if (bunInp) {
      bunInp.value = '3593';
      bunInp.dispatchEvent(new Event('input', { bubbles: true }));
      bunInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push('본번: 3593 입력');
    }
    if (jiInp) {
      jiInp.value = '1';
      jiInp.dispatchEvent(new Event('input', { bubbles: true }));
      jiInp.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push('부번: 1 입력');
    }

    // 지목 -> '대' (08)
    const jimokSelect = document.querySelector('select[id*=sbx_KcpPlatLc_jimokCd], select[id*=jimok]');
    if (jimokSelect) {
      jimokSelect.value = '08';
      jimokSelect.dispatchEvent(new Event('change', { bubbles: true }));
      logs.push('지목: 대 선택');
    }

    // 대지조건 대표여부 체크
    const platReprCb = document.querySelector('input[id*=cb_KcpPlatLc_reprYn]');
    if (platReprCb && !platReprCb.checked) {
      platReprCb.click();
      platReprCb.checked = true;
    }

    // [지역지구구역정보가져오기] 버튼 클릭
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const btnJijigu = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t.includes('지역지구구역') || t.includes('지역지구구역정보가져오기');
    });
    if (btnJijigu) {
      btnJijigu.click();
      logs.push('✔ [지역지구구역정보가져오기] 버튼 클릭');
    }

    // 대지조건 [+ 추가] 버튼 클릭
    const addPlatBtn = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      const p = b.closest('div[id*=PlatLc]') || b.closest('div[id*=plat]') || b.parentElement;
      return (t === '+ 추가' || t === '추가') && p && (p.innerText.includes('대지조건') || p.id.includes('PlatLc'));
    }) || document.querySelector('input[id*=btn_KcpPlatLc_add], button[id*=btn_KcpPlatLc_add]');

    if (addPlatBtn) {
      addPlatBtn.click();
      logs.push('✔ 대지조건 [+ 추가] 버튼 클릭');
    }

    return logs;
  }, projectInfo);

  platLog.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 2000));

  // 5. 하단 [저장] 실행
  console.log('\n💾 [기본개요] 최종 저장 실행 중...');
  await page.evaluate(() => {
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                       document.getElementById('mf_wfm_selfgovn_content_bottomSave');
    if (bottomSave) {
      bottomSave.click();
      console.log('하단 저장 버튼 클릭 완료');
    }
  });

  await new Promise(r => setTimeout(r, 2500));

  // 알림 팝업 확인
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '확인' && el.offsetParent;
    });
    okBtns.forEach(b => b.click());
  });

  console.log('================================================================');
  console.log('🎉 [완료] 건축주, 설계자, 대지조건 UI 입력 및 추가/저장 완료!');
  console.log('================================================================');
}

if (require.main === module) {
  fillMyeongjiUIExact().catch(console.error);
}

module.exports = { fillMyeongjiUIExact };
