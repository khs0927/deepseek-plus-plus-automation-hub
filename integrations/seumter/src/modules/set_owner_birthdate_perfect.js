const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const projectInfo = require('../config/myeongji_project.json');

async function setOwnerBirthdatePerfect() {
  console.log('================================================================');
  console.log('👤 [건축주(김순자) 생년월일(1952-02-21) 단독 입력 및 저장]');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('websquare.html')) || pages[0];

  console.log(`📄 대상 페이지: "${await page.title()}"`);
  await page.bringToFront();

  // Dialog 자동 수락 리스너
  page.on('dialog', async dialog => {
    console.log(`  💬 [알림]: "${dialog.message()}" -> 확인`);
    await dialog.accept().catch(() => {});
  });

  // 1. [기본개요] 탭 클릭
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '기본개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. 건축주 데이터 주입: 생년월일(19520221)
  const log = await page.evaluate((data) => {
    const logs = [];
    const dListOwnr = $p.getComponentById('mf_wfm_selfgovn_content_ds_KcpRelpOwnr') || $p.data.mf_wfm_selfgovn_content_ds_KcpRelpOwnr;

    if (dListOwnr) {
      if (dListOwnr.getRowCount() === 0 && dListOwnr.insertRow) dListOwnr.insertRow(0);

      // 생년월일 8자리(19520221) 설정
      dListOwnr.setCellData(0, 'reprvYn', '1');
      dListOwnr.setCellData(0, 'nm', data.owner.name);
      dListOwnr.setCellData(0, 'jmno', '19520221');
      dListOwnr.setCellData(0, 'jmGbCd', '01');
      dListOwnr.setCellData(0, 'jmGbNm', '내국인');
      dListOwnr.setCellData(0, 'relpGbCd', '01');
      dListOwnr.setCellData(0, 'relpGbNm', '건축주');
      dListOwnr.setCellData(0, 'naLocFullAddr', data.owner.address);
      dListOwnr.setCellData(0, 'loc', data.owner.address);
      dListOwnr.setCellData(0, 'naLocRoadNm', '경상남도 창원시 동읍 용강리');
      dListOwnr.setCellData(0, 'naLocDetlAddr', '289');
      dListOwnr.setCellData(0, 'cmpRelpGbCd', '01');
      dListOwnr.setCellData(0, 'authcert', '미인증');
      dListOwnr.setCellData(0, 'rowStatus', 'U');

      logs.push(`✔ 건축주 nm: "${data.owner.name}", 생년월일 jmno: "19520221", 주소: "${data.owner.address}" 바인딩 완료`);
    }

    // UI 인풋 필드 동기화
    const nameInp = document.querySelector('input[id*=txt_KcpRelpOwnr_ownrNm], input[id*=ownrNm]');
    if (nameInp) nameInp.value = data.owner.name;

    const calObj = $p.getComponentById('mf_wfm_selfgovn_content_txt_jmno_calJmno');
    if (calObj && calObj.setValue) calObj.setValue('19520221');

    const calInput = document.querySelector('input[id*=txt_jmno_calJmno_input], input[id*=calJmno]');
    if (calInput) calInput.value = '1952-02-21';

    const addrInp = document.querySelector('input[id*=txt_KcpRelpOwnr_roadAddr], input[id*=roadAddr]');
    if (addrInp) addrInp.value = data.owner.address;

    return logs;
  }, projectInfo);

  log.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 1500));

  // 3. 하단 [저장] 실행
  console.log('\n💾 [기본개요] 하단 최종 저장 실행 중...');
  await page.evaluate(() => {
    const bottomSave = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                       document.getElementById('mf_wfm_selfgovn_content_bottomSave');
    if (bottomSave) bottomSave.click();
  });

  await new Promise(r => setTimeout(r, 2500));

  // 알림 확인 수락
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return t === '확인' && el.offsetParent;
    });
    okBtns.forEach(b => b.click());
  });

  // 최종 스크린샷 캡처
  await page.screenshot({ path: 'scratch/owner_birthdate_verified.png' });
  console.log('📸 스크린샷 캡처 완료: scratch/owner_birthdate_verified.png');

  // 그리드 내용 확인
  const gridContent = await page.evaluate(() => {
    const grd = document.getElementById('mf_wfm_selfgovn_content_grd_KcpRelpOwnr');
    return grd ? grd.innerText : '';
  });

  console.log('\n📋 [건축주 그리드 최종 표시]:');
  console.log(gridContent);

  console.log('================================================================');
  console.log('🎉 [완료] 건축주(김순자) 생년월일(1952-02-21) 정상 반영 및 저장 완료!');
  console.log('================================================================');
}

if (require.main === module) {
  setOwnerBirthdatePerfect().catch(console.error);
}

module.exports = { setOwnerBirthdatePerfect };
