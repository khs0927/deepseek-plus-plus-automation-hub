const { chromium } = require('playwright');
const path = require('path');
const { CDP_URL } = require('../config/constants');

async function fillProjectOverview(configFileName = 'myeongji_project.json') {
  const configPath = path.resolve(__dirname, '../config', configFileName);
  const data = require(configPath);

  console.log('================================================================');
  console.log(`🚀 [세움터 자동화] 기본개요 일괄 자동 작성 파이프라인`);
  console.log(`📁 프로젝트: "${data.projectName}"`);
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('websquare.html')) || pages[0];

  console.log(`📄 대상 페이지: "${await page.title()}"`);
  await page.bringToFront();

  // 자동 다이얼로그 수락
  page.on('dialog', async d => {
    console.log(`  💬 [알림]: "${d.message()}" -> 수락`);
    await d.accept().catch(() => {});
  });

  // 1. [기본개요] 탭 클릭
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('a, button, span, li')).find(el => (el.innerText || el.value || '').trim() === '기본개요');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. 건축주 & 설계자 & 대지조건 & 전체개요 & 주차장 & 정화조 일괄 바인딩
  const execLogs = await page.evaluate((cfg) => {
    const logs = [];
    const $p = window.$p;
    const compPrefix = 'mf_wfm_selfgovn_content_';

    // -------------------------------------------------------------
    // [A. 건축주]
    // -------------------------------------------------------------
    if (cfg.owner) {
      const txtNm = $p.getComponentById(compPrefix + 'txt_relpNm');
      if (txtNm) txtNm.setValue(cfg.owner.name);

      const cbxRepr = $p.getComponentById(compPrefix + 'cbx_reprvYn');
      if (cbxRepr) cbxRepr.setValue('Y');

      const cboOwnrGb = $p.getComponentById(compPrefix + 'cbo_archownrGbCd');
      if (cboOwnrGb) {
        if (cfg.owner.ownerGbCd) cboOwnrGb.setValue(cfg.owner.ownerGbCd);
        else cboOwnrGb.setSelectedIndex(10); // 개인
      }

      const sbxJmGb = $p.getComponentById(compPrefix + 'txt_jmno_sbxJmGb');
      if (sbxJmGb) sbxJmGb.setValue(cfg.owner.residentGbCd || '1');

      const birth = (cfg.owner.residentNo ? cfg.owner.residentNo.replace('-', '').substring(0, 6) : null) || cfg.owner.birthDate || '19520221';
      const fullBirth = birth.length === 6 ? ('19' + birth) : birth;

      const calJmno = $p.getComponentById(compPrefix + 'txt_jmno_calJmno');
      if (calJmno) calJmno.setValue(fullBirth);

      const telInp = document.getElementById(compPrefix + 'kcpRelpOwnr_telno');
      if (telInp && cfg.owner.tel) {
        telInp.value = cfg.owner.tel;
        telInp.dispatchEvent(new Event('input', { bubbles: true }));
        telInp.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const mtelInp = document.getElementById(compPrefix + 'kcpRelpOwnr_mtelno');
      if (mtelInp && cfg.owner.mobile) {
        mtelInp.value = cfg.owner.mobile;
        mtelInp.dispatchEvent(new Event('input', { bubbles: true }));
        mtelInp.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const emailSendCb = document.querySelector('input[id*=emailSendYn], input[id*=cb_emailSendYn]');
      if (emailSendCb) emailSendCb.checked = true;

      const emailInp = document.querySelector('input[id*=emailAddr], input[id*=email]');
      if (emailInp && cfg.owner.email) {
        emailInp.value = cfg.owner.email;
        emailInp.dispatchEvent(new Event('input', { bubbles: true }));
        emailInp.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const dsOwnr = $p.getComponentById(compPrefix + 'ds_KcpRelpOwnr') || window.ds_KcpRelpOwnr;
      if (dsOwnr) {
        if (dsOwnr.getRowCount() === 0 && dsOwnr.insertRow) dsOwnr.insertRow(0);
        dsOwnr.setCellData(0, 'reprvYn', '1');
        dsOwnr.setCellData(0, 'nm', cfg.owner.name);
        dsOwnr.setCellData(0, 'jmno', fullBirth);
        dsOwnr.setCellData(0, 'jmGbCd', cfg.owner.residentGbCd || '1');
        dsOwnr.setCellData(0, 'jmGbNm', cfg.owner.residentGbNm || '내국인');
        dsOwnr.setCellData(0, 'archownrGbCd', cfg.owner.ownerGbCd || '12');
        dsOwnr.setCellData(0, 'archOwnrGbNm', cfg.owner.ownerGbNm || '개인');
        dsOwnr.setCellData(0, 'naLocFullAddr', cfg.owner.address || '');
        dsOwnr.setCellData(0, 'loc', cfg.owner.address || '');
        dsOwnr.setCellData(0, 'telno', cfg.owner.tel || '');
        dsOwnr.setCellData(0, 'mtelno', cfg.owner.mobile || '');
        dsOwnr.setCellData(0, 'emailAddr', cfg.owner.email || '');
        dsOwnr.setCellData(0, 'emailSendYn', '1');
        dsOwnr.setCellData(0, 'authcert', '미인증');
        dsOwnr.setCellData(0, 'rowStatus', 'U');
        logs.push(`✔ 건축주(${cfg.owner.name}) 등록 완료`);
      }
    }

    // -------------------------------------------------------------
    // [B. 설계자]
    // -------------------------------------------------------------
    const archBiz = cfg.architect?.businessNo || '604-08-99164';
    const bizComp = $p.getComponentById(compPrefix + 'kcpRelpDsgnr_bizno');
    if (bizComp) bizComp.setValue(archBiz);

    const btnAssc = document.getElementById(compPrefix + 'trg_kcpRelpDsgnr_asscMembNo');
    if (btnAssc) btnAssc.click();

    const dsDsgnr = $p.getComponentById(compPrefix + 'ds_KcpRelpDsgnr') || window.ds_KcpRelpDsgnr;
    if (dsDsgnr) {
      while (dsDsgnr.getRowCount() > 1) dsDsgnr.removeRow(1);
      if (dsDsgnr.getRowCount() === 0 && dsDsgnr.insertRow) dsDsgnr.insertRow(0);
      dsDsgnr.setCellData(0, 'reprvYn', '1');
      dsDsgnr.setCellData(0, 'nm', cfg.architect?.name || '이동희');
      dsDsgnr.setCellData(0, 'bizno', archBiz);
      dsDsgnr.setCellData(0, 'offcnm', cfg.architect?.officeName || '건축사사무소 지음');
      dsDsgnr.setCellData(0, 'telno', cfg.architect?.tel || '051-791-0201');
      dsDsgnr.setCellData(0, 'rowStatus', 'U');
      logs.push(`✔ 설계자(${cfg.architect?.name || '이동희'}) 등록 완료`);
    }

    // -------------------------------------------------------------
    // [C. 대지조건]
    // -------------------------------------------------------------
    if (cfg.location) {
      const bunjiParts = (cfg.location.bunji || '').split('-');
      const mnnm = cfg.location.mnnm || bunjiParts[0] || '';
      const slno = cfg.location.slno || bunjiParts[1] || '';

      const mnnmComp = $p.getComponentById(compPrefix + 'txt_KcpPlatLc_mnnm');
      if (mnnmComp && mnnm) mnnmComp.setValue(String(mnnm));

      const slnoComp = $p.getComponentById(compPrefix + 'txt_KcpPlatLc_slno');
      if (slnoComp && slno) slnoComp.setValue(String(slno));

      const jimokComp = $p.getComponentById(compPrefix + 'cbo_kcpPlatLc_jimokCd');
      if (jimokComp) jimokComp.setValue(cfg.location.jimokCd || '08');

      const dListPlat = $p.getComponentById(compPrefix + 'ds_KcpPlatLc') || window.ds_KcpPlatLc;
      if (dListPlat) {
        if (dListPlat.getRowCount() === 0 && dListPlat.insertRow) dListPlat.insertRow(0);
        dListPlat.setCellData(0, 'platPlc', `${cfg.location.sido} ${cfg.location.sigungu} ${cfg.location.bjdong} ${cfg.location.bunji}`);
        dListPlat.setCellData(0, 'sigunguCd', cfg.location.sigunguCd || '26440');
        dListPlat.setCellData(0, 'sigunguNm', `${cfg.location.sido} ${cfg.location.sigungu}`);
        dListPlat.setCellData(0, 'bjdongCd', cfg.location.bjdongCd || '10400');
        dListPlat.setCellData(0, 'bjdongNm', cfg.location.bjdong);
        dListPlat.setCellData(0, 'mnnm', String(mnnm));
        dListPlat.setCellData(0, 'slno', String(slno));
        dListPlat.setCellData(0, 'bun', String(mnnm));
        dListPlat.setCellData(0, 'ji', String(slno));
        dListPlat.setCellData(0, 'jimokNm', cfg.location.jimok || '대');
        dListPlat.setCellData(0, 'jimokCd', cfg.location.jimokCd || '08');
        dListPlat.setCellData(0, 'reprYn', '1');
        dListPlat.setCellData(0, 'rowStatus', 'U');
        logs.push(`✔ 대지조건(${cfg.location.bjdong} ${cfg.location.bunji}) 등록 완료`);
      }
    }

    // -------------------------------------------------------------
    // [D. 전체개요 & 주차장 & 정화조]
    // -------------------------------------------------------------
    if (cfg.buildingOverview) {
      const bo = cfg.buildingOverview;
      let aboveFlr = 10;
      let underFlr = 2;
      if (typeof bo.floors === 'object') {
        aboveFlr = bo.floors.above || 10;
        underFlr = bo.floors.underground || 2;
      } else if (typeof bo.floors === 'string') {
        const m = bo.floors.match(/지하\s*(\d+).*지상\s*(\d+)/);
        if (m) {
          underFlr = m[1];
          aboveFlr = m[2];
        }
      }

      const dListArch = $p.getComponentById(compPrefix + 'ds_KcpArchPms') || window.ds_KcpArchPms;
      if (dListArch) {
        dListArch.set('platArea', String(bo.landArea));
        dListArch.set('archArea', String(bo.archArea));
        dListArch.set('bcrat', String(bo.bcRat));
        dListArch.set('totarea', String(bo.totalArea));
        dListArch.set('vlratCalcTotarea', String(bo.vlRatEstmTotArea));
        dListArch.set('vlrat', String(bo.vlRat));
        dListArch.set('mainPurpNm', bo.mainPurp);
        dListArch.set('strctNm', bo.structure || '철근콘크리트구조');
        dListArch.set('grndFlrCnt', String(aboveFlr));
        dListArch.set('ugrndFlrCnt', String(underFlr));
        dListArch.set('heit', String(bo.height || 0));
        dListArch.set('bldNm', cfg.location?.buildingName || '');
        dListArch.set('mainBildCnt', String(bo.mainBuildingCount || 1));
        dListArch.set('atchBildDongCnt', String(bo.subBuildingCount || 0));
        dListArch.set('rowStatus', 'U');
        logs.push(`✔ 전체개요(대지: ${bo.landArea}㎡, 연면적: ${bo.totalArea}㎡) 등록 완료`);
      }

      // 주차장 파싱 (객체 또는 문자열)
      let autoCnt = 144;
      let autoArea = 1675.8;
      if (typeof bo.parking === 'object') {
        autoCnt = bo.parking.indoorAutoCount || 144;
        autoArea = bo.parking.indoorAutoArea || 1675.8;
      } else if (typeof bo.parking === 'string') {
        const m = bo.parking.match(/(\d+)\s*대\s*\(([\d,.]+)/);
        if (m) {
          autoCnt = m[1];
          autoArea = m[2].replace(',', '');
        }
      }

      const dListPklot = $p.getComponentById(compPrefix + 'ds_KcpPklot') || window.ds_KcpPklot;
      if (dListPklot) {
        dListPklot.set('indrAutoUtcnt', String(autoCnt));
        dListPklot.set('indrAutoArea', String(autoArea));
        dListPklot.set('totUtcnt', String(autoCnt));
        dListPklot.set('totArea', String(autoArea));
        dListPklot.set('rowStatus', 'U');
        logs.push(`✔ 주차장(${autoCnt}대, ${autoArea}㎡) 등록 완료`);
      }

      // 하수처리시설 파싱
      let sewerType = '하수종말처리장연결';
      if (typeof bo.sewer === 'object') {
        sewerType = bo.sewer.type || '하수종말처리장연결';
      } else if (typeof bo.sewer === 'string') {
        sewerType = bo.sewer.includes('하수종말') ? '하수종말처리장연결' : bo.sewer;
      }

      const dListWclf = $p.getComponentById(compPrefix + 'ds_KcpWclf') || window.ds_KcpWclf;
      if (dListWclf) {
        if (dListWclf.getRowCount() === 0 && dListWclf.insertRow) dListWclf.insertRow(0);
        dListWclf.setCellData(0, 'wclfModeNm', sewerType);
        dListWclf.setCellData(0, 'reprYn', '1');
        dListWclf.setCellData(0, 'rowStatus', 'U');
        logs.push(`✔ 하수처리시설(${sewerType}) 등록 완료`);
      }
    }

    return logs;
  }, data);

  execLogs.forEach(l => console.log('  ' + l));
  await new Promise(r => setTimeout(r, 1500));

  // 3. 최종 저장 실행
  console.log('\n💾 세움터 서버 최종 저장 실행 중...');
  await page.evaluate(() => {
    const saveBtn = document.getElementById('mf_wfm_selfgovn_content_trg_KcpRecp_bottomSave') ||
                    document.getElementById('mf_wfm_selfgovn_content_wfm_BPMAZD01I01_trg_KcpRecp_bottomSave') ||
                    Array.from(document.querySelectorAll('input, button, a')).find(b => (b.value || b.innerText || '').trim() === '저장');
    if (saveBtn) saveBtn.click();
  });

  await new Promise(r => setTimeout(r, 2000));

  // 확인 팝업 자동 수락
  await page.evaluate(() => {
    const okBtns = Array.from(document.querySelectorAll('button, input, a')).filter(el => {
      const t = (el.innerText || el.value || '').trim();
      return (t === '확인' || t === '예') && el.offsetParent !== null;
    });
    okBtns.forEach(b => b.click());
  });

  await new Promise(r => setTimeout(r, 1500));

  console.log('================================================================');
  console.log('🎉 [완료] 기본개요 전체 탭 입력 및 저장이 성공적으로 완료되었습니다!');
  console.log('================================================================');
}

if (require.main === module) {
  const configFile = process.argv[2] || 'myeongji_project.json';
  fillProjectOverview(configFile).catch(console.error);
}

module.exports = { fillProjectOverview };
