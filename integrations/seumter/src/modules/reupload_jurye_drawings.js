const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

// 주례동 315-4 도면 폴더 매핑 (총 6개 도면 분류 폴더)
// ※ PDF 폴더(507, 510)는 사용자의 요청에 따라 삭제/수정하지 않고 그대로 유지합니다.
const DRAWING_FOLDERS = [
  {
    folderName: 'A10(설계개요)',
    nodeId: 'BDA10_anchor',
    files: ['대수선개요.dwg']
  },
  {
    folderName: 'A11(배치도)',
    nodeId: 'BDA11_anchor',
    files: ['배치도.dwg']
  },
  {
    folderName: 'A31(평면도)',
    nodeId: 'BDA31_anchor',
    files: [
      '지1층평면도.dwg',
      '1층평면도(변경전).dwg',
      '1층평면도(변경후).dwg',
      '2층평면도(변경전).dwg',
      '2층평면도(변경후).dwg',
      '3층평면도(변경전).dwg',
      '3층평면도(변경후).dwg',
      '옥상층평면도.dwg'
    ]
  },
  {
    folderName: 'A32(입면도)',
    nodeId: 'BDA32_anchor',
    files: ['정면도.dwg', '우측면도.dwg']
  },
  {
    folderName: 'A33(주단면도)',
    nodeId: 'BDA33_anchor',
    files: ['종단면도(변경전).dwg', '종단면도(변경후).dwg']
  },
  {
    folderName: 'A99(기타/건축물대장)',
    nodeId: 'BDA99_anchor',
    files: [
      '1층평면도(건축물대장).dwg',
      '2층평면도(건축물대장).dwg',
      '3층평면도(건축물대장).dwg'
    ]
  }
];

async function reuploadJuryeDrawings() {
  console.log('================================================================');
  console.log('🏗️ [주례동 315-4] 세움터 설계도서 도면 삭제 및 최신 도면 재업로드');
  console.log('   - 대상 소스: ' + TARGET_DIR);
  console.log('   - 규칙: 기존 도면(DWG) 삭제 후 재업로드, PDF 문서는 유지');
  console.log('================================================================\n');

  // 파일 존재 여부 선검증
  for (const group of DRAWING_FOLDERS) {
    for (const f of group.files) {
      const fullPath = path.join(TARGET_DIR, f);
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ [경고] 파일 누락: ${fullPath}`);
      }
    }
  }

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('Edge 브라우저 컨텍스트를 찾을 수 없습니다.');
  }

  // 설계도서 팝업 또는 탭 페이지 탐색 (CDDAAA01P03 또는 clsfCd=1042)
  let page = context.pages().find(p => p.url().includes('CDDAAA01P03') || p.url().includes('clsfCd=1042'));

  if (!page) {
    console.log('🔍 설계도서 탭을 탐색 중입니다. 현재 열린 페이지 확인...');
    const pages = context.pages();
    for (let i = 0; i < pages.length; i++) {
      console.log(`  [${i}] ${await pages[i].title()} (${pages[i].url()})`);
    }
    // 가장 최근 활성 페이지 시도
    page = pages[pages.length - 1];
  }

  console.log(`\n📄 작업 대상 페이지: "${await page.title()}" (${page.url()})`);
  await page.bringToFront();

  // 브라우저 alert/confirm 자동 수락
  page.on('dialog', async dialog => {
    console.log(`  💬 [다이얼로그 알림]: "${dialog.message()}" -> 확인`);
    await dialog.accept().catch(() => {});
  });

  let totalDeleted = 0;
  let totalUploaded = 0;

  for (let i = 0; i < DRAWING_FOLDERS.length; i++) {
    const task = DRAWING_FOLDERS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${DRAWING_FOLDERS.length}] 📁 폴더 진입: "${task.folderName}" (Node ID: ${task.nodeId})`);

    // 1. 트리 노드 클릭하여 해당 폴더로 진입
    const clickSuccess = await page.evaluate((nodeId) => {
      const el = document.getElementById(nodeId);
      if (el) {
        // 상위 부모 폴더가 닫혀있으면 펼치기
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
      console.log(`  ⚠️ 노드 ID ${task.nodeId} 직접 클릭 실패 - 재시도 대기`);
    }

    await new Promise(r => setTimeout(r, 1200));

    // 2. 기존 도면(DWG) 파일 삭제 처리 (PDF는 제외)
    const delResult = await page.evaluate(() => {
      const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));
      if (fileChecks.length === 0) {
        return { count: 0, msg: '삭제할 기존 파일 없음' };
      }

      let checkedCount = 0;
      fileChecks.forEach(cb => {
        // PDF 파일이 아닌 경우에만 체크 (또는 DWG인 경우)
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
    const fileInput = await page.$('input[type=file]');
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

  const saved = await page.evaluate(() => {
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
  console.log(`🎉 [완료] 주례동 315-4 최신 도면 ${totalUploaded}건 재업로드 & 저장이 성공적으로 완료되었습니다!`);
  console.log('================================================================');
}

if (require.main === module) {
  reuploadJuryeDrawings().catch(console.error);
}

module.exports = { reuploadJuryeDrawings, DRAWING_FOLDERS };
