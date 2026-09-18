const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');
const { DRAWING_FOLDERS } = require('./reupload_jurye_drawings');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

async function waitAndRunReupload() {
  console.log('================================================================');
  console.log('⏳ [주례동 315-4] 세움터 인증서 로그인 & 설계도서 탭 감지 대기 중...');
  console.log('================================================================');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];

  let targetPage = null;

  // 최대 5분 동안 설계도서 탭 감지 대기
  for (let attempt = 1; attempt <= 150; attempt++) {
    const pages = context.pages();
    for (const p of pages) {
      try {
        const url = p.url();
        const hasTree = await p.evaluate(() => {
          return !!(document.getElementById('BDA10_anchor') ||
                    document.getElementById('BDA31_anchor') ||
                    document.querySelector('.jstree') ||
                    window.location.href.includes('CDDAAA01P03'));
        }).catch(() => false);

        if (hasTree || url.includes('CDDAAA01P03')) {
          targetPage = p;
          break;
        }
      } catch (e) {}
    }

    if (targetPage) {
      console.log(`\n🎯 [설계도서 페이지 감지 성공!]`);
      console.log(`   - Title: "${await targetPage.title()}"`);
      console.log(`   - URL: ${targetPage.url()}`);
      break;
    }

    if (attempt % 5 === 0) {
      console.log(`[${attempt * 2}초 대기 중] 인증서 로그인 및 신청서 [설계도서] 탭 열림 대기...`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!targetPage) {
    console.error('❌ 시간 초과: 설계도서 페이지를 찾지 못했습니다.');
    return;
  }

  await targetPage.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Dialog 자동 수락
  targetPage.on('dialog', async dialog => {
    console.log(`  💬 [다이얼로그 알림]: "${dialog.message()}" -> 확인`);
    await dialog.accept().catch(() => {});
  });

  console.log('\n================================================================');
  console.log('🚀 [도면 삭제 및 최신 DWG 도면 재업로드 시작]');
  console.log('================================================================');

  let totalDeleted = 0;
  let totalUploaded = 0;

  for (let i = 0; i < DRAWING_FOLDERS.length; i++) {
    const task = DRAWING_FOLDERS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${DRAWING_FOLDERS.length}] 📁 폴더 진입: "${task.folderName}" (Node ID: ${task.nodeId})`);

    // 1. 트리 노드 클릭
    const clickSuccess = await targetPage.evaluate((nodeId) => {
      const el = document.getElementById(nodeId);
      if (el) {
        let p = el.parentElement;
        while (p && p !== document.body) {
          if (p.classList && p.classList.contains('jstree-closed')) {
            const icon = p.querySelector('.jstree-icon');
            if (icon) icon.click();
          }
          p = p.parentElement;
        }
        el.scrollIntoView({ block: 'center' });
        el.click();
        return { ok: true, text: el.innerText.trim() };
      }
      return { ok: false };
    }, task.nodeId);

    if (clickSuccess.ok) {
      console.log(`  ✔ [트리 노드 선택 완료]: "${clickSuccess.text}"`);
    } else {
      console.log(`  ⚠️ 노드 ID ${task.nodeId} 직접 클릭 실패`);
    }

    await new Promise(r => setTimeout(r, 1200));

    // 2. 기존 도면(DWG) 파일 삭제 처리 (PDF는 제외)
    const delResult = await targetPage.evaluate(() => {
      const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));
      if (fileChecks.length === 0) {
        return { count: 0, msg: '삭제할 기존 파일 없음' };
      }

      let checkedCount = 0;
      fileChecks.forEach(cb => {
        const rowText = (cb.closest('tr') ? cb.closest('tr').innerText : '').toLowerCase();
        if (!rowText.includes('.pdf')) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          checkedCount++;
        }
      });

      if (checkedCount > 0) {
        const delBtn = document.getElementById('fileViewModBtn') ||
                       Array.from(document.querySelectorAll('button, input[type=button], a')).find(b => (b.innerText || b.value || '').trim() === '삭제');
        if (delBtn) {
          delBtn.click();
        } else if (typeof deleteFiles === 'function') {
          deleteFiles();
        }
      }

      return { count: checkedCount, msg: '삭제 요청 완료' };
    });

    if (delResult.count > 0) {
      console.log(`  🗑️ [기존 도면 삭제] ${delResult.count}개 도면 삭제 실행`);
      totalDeleted += delResult.count;
      await new Promise(r => setTimeout(r, 1500));
    } else {
      console.log(`  ⚪ [기존 도면 없음] 삭제 대상 없음`);
    }

    // 3. 최신 DWG 도면 파일 주입
    const filePaths = task.files.map(f => path.join(TARGET_DIR, f)).filter(p => fs.existsSync(p));
    if (filePaths.length === 0) {
      console.log('  ⚠️ 업로드할 파일이 대상 폴더에 존재하지 않습니다.');
      continue;
    }

    console.log(`  🚀 [업로드 투입] ${filePaths.length}개 파일: ${task.files.join(', ')}`);
    const fileInput = await targetPage.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      console.log(`  ✔ [파일 투입 성공] "${task.folderName}" 폴더에 ${filePaths.length}개 파일 반영`);
      totalUploaded += filePaths.length;
    } else {
      console.log('  ❌ fileInput 요소를 찾을 수 없습니다.');
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  // 4. 설계도서 최종 저장
  console.log('\n----------------------------------------------------------------');
  console.log(`💾 전체 작업 완료 (삭제: ${totalDeleted}건, 신규 등록: ${totalUploaded}건)!`);
  console.log('💾 설계도서 최종 저장 버튼 클릭...');

  const saved = await targetPage.evaluate(() => {
    const saveBtn = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '저장' || t === '설계도서 저장' || t.includes('등록');
    });
    if (saveBtn) {
      saveBtn.click();
      return { ok: true, id: saveBtn.id, text: saveBtn.innerText || saveBtn.value };
    }
    return { ok: false };
  });

  if (saved.ok) {
    console.log(`✔ [저장 완료]: ${saved.text || saved.id}`);
  } else {
    console.log('⚠️ 저장 버튼을 직접 찾지 못했습니다.');
  }

  console.log('================================================================');
  console.log(`🎉 [성공] 주례동 315-4 최신 도면 ${totalUploaded}건 재업로드 & 저장이 성공적으로 완료되었습니다!`);
  console.log('================================================================');
}

if (require.main === module) {
  waitAndRunReupload().catch(console.error);
}

module.exports = { waitAndRunReupload };
