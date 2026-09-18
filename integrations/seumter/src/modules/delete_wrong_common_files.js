const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

// 삭제 대상이 되는 0(공통) 하위 노드 목록
const WRONG_COMMON_NODES = [
  { name: 'A00(공통도면)', id: 'BDA00_anchor' },
  { name: 'A01(표지)', id: 'BDA01_anchor' },
  { name: 'A02(도면목록)', id: 'BDA02_anchor' },
  { name: 'A03(투시도_조감도)', id: 'BDA03_anchor' },
  { name: 'A04(일반사항)', id: 'BDA04_anchor' },
  { name: 'A09(기타)', id: 'BDA09_anchor' }
];

async function deleteWrongFiles() {
  console.log('================================================================');
  console.log('🗑️ [세움터 0(공통) 폴더 내 잘못 업로드된 파일 정리/삭제]');
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03') || p.url().includes('clsfCd=1042')) || pages[pages.length - 1];

  console.log(`📄 대상 페이지: "${await page.title()}"`);
  await page.bringToFront();

  // Dialog 자동 수락 핸들러
  page.on('dialog', async dialog => {
    console.log(`  💬 [다이얼로그 알림]: "${dialog.message()}" -> 수락(확인)`);
    await dialog.accept().catch(() => {});
  });

  let totalDeletedCount = 0;

  for (let i = 0; i < WRONG_COMMON_NODES.length; i++) {
    const node = WRONG_COMMON_NODES[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${WRONG_COMMON_NODES.length}] 📁 폴더 확인: "${node.name}" (ID: ${node.id})`);

    // 1. 트리 노드 클릭
    const clicked = await page.evaluate((nodeId) => {
      const el = document.getElementById(nodeId);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.click();
        return { ok: true, text: el.innerText.trim() };
      }
      return { ok: false };
    }, node.id);

    if (clicked.ok) {
      console.log(`  ✔ 노드 선택: "${clicked.text}"`);
    } else {
      console.log(`  ⚠️ 노드 ID ${node.id} 클릭 실패`);
    }

    await new Promise(r => setTimeout(r, 1500));

    // 2. 파일 목록 조회 및 체크박스 선택 후 삭제 실행
    const delResult = await page.evaluate(() => {
      const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));
      const allCheck = document.getElementById('fileListAllCheck');

      if (fileChecks.length === 0) {
        return { count: 0, status: '파일 없음' };
      }

      // 모든 체크박스 체크
      fileChecks.forEach(cb => {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (allCheck) {
        allCheck.checked = true;
        allCheck.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 삭제 버튼 또는 함수 실행
      const delBtn = document.getElementById('fileViewModBtn');
      if (delBtn) {
        delBtn.click();
      } else if (typeof deleteFiles === 'function') {
        deleteFiles();
      }

      return { count: fileChecks.length, status: '삭제 요청 완료' };
    });

    if (delResult.count > 0) {
      console.log(`  🚀 [삭제 완료] ${delResult.count}개 파일 삭제 실행됨`);
      totalDeletedCount += delResult.count;
      await new Promise(r => setTimeout(r, 2000));
    } else {
      console.log('  ⚪ 삭제할 파일이 없습니다 (정상).');
    }
  }

  // 3. 최종 저장
  console.log('\n----------------------------------------------------------------');
  console.log(`💾 정리 완료 (총 ${totalDeletedCount}개 파일 삭제)! 설계도서 저장 진행...`);

  await page.evaluate(() => {
    const saveBtn = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '저장' || t === '설계도서 저장' || t.includes('등록');
    });
    if (saveBtn) {
      console.log('저장 버튼 클릭:', saveBtn.id || saveBtn.innerText);
      saveBtn.click();
    }
  });

  console.log('================================================================');
  console.log('🎉 [완료] 잘못 들어간 0(공통) 하위 파일 삭제 및 정리가 완료되었습니다!');
  console.log('================================================================');
}

if (require.main === module) {
  deleteWrongFiles().catch(console.error);
}

module.exports = { deleteWrongFiles };
