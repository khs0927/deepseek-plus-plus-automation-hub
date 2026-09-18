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
    folderName: 'A99(기타)',
    nodeId: 'BDA99_anchor',
    files: [
      '1층평면도(건축물대장).dwg',
      '2층평면도(건축물대장).dwg',
      '3층평면도(건축물대장).dwg'
    ]
  }
];

async function deleteAndUpload() {
  console.log('================================================================');
  console.log('🗑️ [선택 파일 삭제] ➔ 최신 DWG 도면 재업로드 실행');
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

  for (let i = 0; i < DRAWING_TASKS.length; i++) {
    const task = DRAWING_TASKS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${DRAWING_TASKS.length}] 📁 폴더 선택: "${task.folderName}" (${task.nodeId})`);

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

    await new Promise(r => setTimeout(r, 1200));

    // 2. [선택 파일 삭제] 절차 실행
    const deleteAction = await page.evaluate(() => {
      const allCheck = document.getElementById('fileListAllCheck');
      const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));

      if (fileChecks.length === 0) {
        return { count: 0, status: '삭제할 파일 없음' };
      }

      // 전체선택 체크박스 클릭 또는 체크
      if (allCheck) {
        allCheck.checked = true;
        allCheck.dispatchEvent(new Event('change', { bubbles: true }));
        allCheck.click();
        if (!allCheck.checked) allCheck.checked = true;
      }

      // 개별 체크박스 모두 체크
      fileChecks.forEach(cb => {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // '선택 파일 삭제' 버튼 탐색 및 클릭
      const delBtn = Array.from(document.querySelectorAll('a, button, input[type=button]')).find(el => {
        const text = (el.innerText || el.value || '').trim();
        return text === '선택 파일 삭제' || text === '선택파일삭제';
      });

      if (delBtn) {
        delBtn.click();
        return { count: fileChecks.length, status: '선택 파일 삭제 버튼 클릭 성공' };
      }

      return { count: fileChecks.length, status: '삭제 버튼을 찾지 못함' };
    });

    console.log(`  🗑️ [선택 파일 삭제]: ${deleteAction.count}개 파일 대상 (${deleteAction.status})`);

    // 삭제 확인 팝업 (WebSquare 팝업이 뜨는 경우 처리)
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => {
      const confirmBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).filter(b => {
        const t = (b.innerText || b.value || '').trim();
        return t === '확인' || t === '예' || t === '삭제';
      });
      // 화면에 보이는 확인 버튼 클릭
      confirmBtns.forEach(b => {
        if (b.offsetParent !== null && b.innerText.trim() === '확인') {
          b.click();
        }
      });
    });

    await new Promise(r => setTimeout(r, 1500));

    // 3. 우측 하단 파일 업로드 상태창 닫기/정리
    await page.evaluate(() => {
      const closeBtns = Array.from(document.querySelectorAll('.btn_close, .upload_close, button, a')).filter(b => {
        const t = (b.innerText || '').trim();
        const cls = b.className || '';
        return t === 'x' || t === 'X' || cls.includes('close') || cls.includes('del');
      });
      closeBtns.forEach(b => {
        if (b.offsetParent !== null && (b.innerText === 'x' || b.innerText === 'X')) {
          b.click();
        }
      });
    });

    // 4. 최신 도면 파일 주입
    const filePaths = task.files.map(f => path.join(TARGET_DIR, f)).filter(p => fs.existsSync(p));
    if (filePaths.length === 0) {
      console.log(`  ⚠️ 대상 폴더에 파일이 존재하지 않습니다: ${task.files.join(', ')}`);
      continue;
    }

    console.log(`  🚀 [새 파일 업로드] ${filePaths.length}개: ${task.files.join(', ')}`);
    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      console.log(`  ✔ [업로드 투입 완료]`);
    } else {
      console.log(`  ❌ fileInput 요소를 찾지 못했습니다.`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n================================================================');
  console.log('💾 전체 6개 도면 폴더 [선택 파일 삭제] ➔ 최신 도면 재업로드 완료!');
  console.log('================================================================');
}

if (require.main === module) {
  deleteAndUpload().catch(console.error);
}

module.exports = { deleteAndUpload };
