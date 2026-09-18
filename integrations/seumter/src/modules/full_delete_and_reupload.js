const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

const DRAWING_TASKS = [
  {
    folderName: 'A10(개요)',
    nodeId: 'BDA10_anchor',
    files: ['대수선개요.dwg']
  },
  {
    folderName: 'A11(설계개요)',
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFullProcess() {
  console.log('================================================================');
  console.log('🏗️ [주례동 315-4] [선택 파일 삭제] ➔ [예] ➔ 최신 도면 재업로드');
  console.log('   - 소스 경로: ' + TARGET_DIR);
  console.log('================================================================\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();
  console.log(`📄 대상 페이지: "${await page.title()}"`);

  // 네이티브 다이얼로그 자동 수락
  page.on('dialog', async dialog => {
    console.log(`  💬 [다이얼로그 수락]: "${dialog.message()}"`);
    await dialog.accept().catch(() => {});
  });

  let totalUploaded = 0;

  for (let i = 0; i < DRAWING_TASKS.length; i++) {
    const task = DRAWING_TASKS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${DRAWING_TASKS.length}] 📁 폴더 진입: "${task.folderName}" (${task.nodeId})`);

    // 1. 트리 노드 클릭
    await page.evaluate((nodeId) => {
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
      }
    }, task.nodeId);

    await sleep(1500);

    // 2. 기존 파일 확인 및 [선택 파일 삭제] 클릭
    const hasFiles = await page.evaluate(() => {
      const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));
      if (fileChecks.length === 0) return 0;

      // 전체선택 체크박스 및 개별 체크박스 모두 선택
      const allCheck = document.getElementById('fileListAllCheck');
      if (allCheck) {
        allCheck.checked = true;
        allCheck.dispatchEvent(new Event('change', { bubbles: true }));
      }
      fileChecks.forEach(cb => {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // '선택 파일 삭제' 버튼 클릭
      const delBtn = Array.from(document.querySelectorAll('a, button, input[type=button]')).find(el => {
        const text = (el.innerText || el.value || '').trim();
        return text === '선택 파일 삭제' || text === '선택파일삭제';
      });

      if (delBtn) {
        delBtn.click();
        return fileChecks.length;
      }
      return fileChecks.length;
    });

    if (hasFiles > 0) {
      console.log(`  🗑️ [선택 파일 삭제 클릭] ${hasFiles}개 파일 선택됨`);
      await sleep(1000);

      // 3. 삭제 확인 팝업에서 [예] 버튼 클릭
      const yesClicked = await page.evaluate(() => {
        const yesBtn = Array.from(document.querySelectorAll('button, input[type=button], a, .w2modal_content button, .w2messagebox_button, .btn')).find(b => {
          const t = (b.innerText || b.value || '').trim();
          return t === '예';
        });
        if (yesBtn) {
          yesBtn.click();
          return true;
        }
        return false;
      });

      if (yesClicked) {
        console.log(`  ✔ [확인 모달: '예' 버튼 클릭 완료]`);
      } else {
        console.log(`  ⚪ '예' 버튼 팝업이 뜨지 않았거나 이미 처리됨`);
      }

      await sleep(2000);
    } else {
      console.log(`  ⚪ 삭제할 기존 파일 없음 (클린 상태)`);
    }

    // 4. 최신 도면 파일 주입
    const filePaths = task.files.map(f => path.join(TARGET_DIR, f)).filter(p => fs.existsSync(p));
    if (filePaths.length === 0) {
      console.log(`  ⚠️ 대상 파일이 로컬 폴더에 존재하지 않습니다: ${task.files.join(', ')}`);
      continue;
    }

    console.log(`  🚀 [새 파일 업로드 투입] ${filePaths.length}개: ${task.files.join(', ')}`);
    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      console.log(`  ✔ [파일 투입 성공]`);
      totalUploaded += filePaths.length;
    } else {
      console.log(`  ❌ fileInput 요소를 찾지 못했습니다.`);
    }

    // 업로드 완료 대기 (프로그레스 바 녹색 전환)
    await sleep(2500);
  }

  // 5. 최종 저장 버튼 클릭
  console.log('\n----------------------------------------------------------------');
  console.log(`💾 전체 6개 폴더, 총 ${totalUploaded}개 도면 업로드 완료! 최종 저장 진행...`);

  const saveResult = await page.evaluate(() => {
    const saveBtn = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '저장' || t === '설계도서 저장' || t.includes('등록');
    });
    if (saveBtn) {
      saveBtn.click();
      return { ok: true, text: saveBtn.innerText || saveBtn.value };
    }
    return { ok: false };
  });

  if (saveResult.ok) {
    console.log(`✔ [최종 저장 완료]: ${saveResult.text}`);
  }

  console.log('\n================================================================');
  console.log(`🎉 [완료] 주례동 315-4 최신 도면 ${totalUploaded}건 업로드 및 저장이 완벽하게 완료되었습니다!`);
  console.log('================================================================');
}

if (require.main === module) {
  runFullProcess().catch(console.error);
}

module.exports = { runFullProcess };
