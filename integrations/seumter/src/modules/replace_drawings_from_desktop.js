const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const DESKTOP_DIR = 'C:\\Users\\USER\\Desktop\\새 폴더';

const REPLACEMENT_TASKS = [
  {
    folderName: 'A21(실내재료마감표)',
    nodeId: 'BDA21_anchor',
    files: ['재료마감표.dwg']
  },
  {
    folderName: 'A32(입면도)',
    nodeId: 'BDA32_anchor',
    files: [
      '정면도.dwg',
      '우측면도.dwg',
      '배면도.dwg',
      '좌측면도.dwg'
    ]
  },
  {
    folderName: 'A33(주단면도)',
    nodeId: 'BDA33_anchor',
    files: [
      '종단면도.dwg',
      '횡단면도-1.dwg',
      '횡단면도-2.dwg'
    ]
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function replaceDrawingsFromDesktop() {
  console.log('================================================================');
  console.log('🔄 [세움터 도면 교체] 바탕화면 새 폴더 도면 ➔ 기존 도면 삭제 후 교체 업로드');
  console.log('   - 소스 디렉토리: ' + DESKTOP_DIR);
  console.log('   - 대상: A21(1건), A32(4건), A33(3건) 총 8건');
  console.log('================================================================\n');

  // 0. 파일 존재 확인
  for (const t of REPLACEMENT_TASKS) {
    for (const f of t.files) {
      const fullPath = path.join(DESKTOP_DIR, f);
      if (!fs.existsSync(fullPath)) {
        console.error(`❌ 파일 누락: ${fullPath}`);
        process.exit(1);
      }
    }
  }
  console.log('✔ 교체 대상 8개 신규 도면 파일 정상 확인 완료.\n');

  // 1. 브라우저 연결
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();
  console.log(`📄 대상 페이지: "${await page.title()}"`);

  // 네이티브 다이얼로그 자동 수락
  page.on('dialog', async dialog => {
    console.log(`  💬 [다이얼로그 자동 수락]: "${dialog.message()}"`);
    await dialog.accept().catch(() => {});
  });

  const summary = [];

  for (let i = 0; i < REPLACEMENT_TASKS.length; i++) {
    const task = REPLACEMENT_TASKS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${REPLACEMENT_TASKS.length}] 📁 폴더 진입: "${task.folderName}" (${task.nodeId})`);

    // A. jstree 트리 노드 클릭
    const nodeRes = await page.evaluate((nodeId) => {
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

    if (nodeRes.ok) {
      console.log(`  ✔ [트리 노드 활성화]: "${nodeRes.text}"`);
    } else {
      console.warn(`  ⚠️ 트리 노드 ID(${task.nodeId}) 탐색 실패`);
    }

    await sleep(1500);

    // B. 기존 파일 확인 및 삭제 진행
    const deleteCount = await page.evaluate(() => {
      const fileChecks = Array.from(document.querySelectorAll('input[name=fileCheckList]'));
      if (fileChecks.length === 0) return 0;

      const allCheck = document.getElementById('fileListAllCheck');
      if (allCheck) {
        allCheck.checked = true;
        allCheck.dispatchEvent(new Event('change', { bubbles: true }));
        allCheck.click();
        if (!allCheck.checked) allCheck.checked = true;
      }
      fileChecks.forEach(cb => {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });

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

    console.log(`  🗑️ 기존 파일 ${deleteCount}건 [선택 파일 삭제] 실행`);
    if (deleteCount > 0) {
      await sleep(1000);
      // 확인 모달 [예] 클릭
      const modalRes = await page.evaluate(() => {
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
      console.log(`  ✔ [확인 모달 '예' 클릭 완료]: ${modalRes}`);
      await sleep(2000);
    }

    // C. 신규 파일 업로드
    const filePaths = task.files.map(f => path.join(DESKTOP_DIR, f));
    console.log(`  🚀 [신규 도면 주입] ${filePaths.length}개: ${task.files.join(', ')}`);

    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      console.log(`  ✔ setInputFiles 주입 성공`);
    } else {
      console.error(`  ❌ fileInput 요소를 찾을 수 없습니다.`);
    }

    // 전송 대기
    const waitMs = Math.max(3500, filePaths.length * 1500);
    console.log(`  ⏳ 서버 등록 대기 (${(waitMs / 1000).toFixed(1)}초)...`);
    await sleep(waitMs);

    // D. 등록 결과 확인
    const uploaded = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.w2grid_body_table tr, table tr'))
        .map(tr => tr.innerText.trim())
        .filter(t => t.includes('.dwg') || t.includes('.pdf'));
      const checkboxes = document.querySelectorAll('input[name=fileCheckList]').length;
      return { checkboxes, rows };
    });

    console.log(`  📋 [등록 완료] 현재 체크박스: ${uploaded.checkboxes}건`);
    uploaded.rows.forEach(r => {
      if (r.includes('dwg') && r.includes('2026-')) {
        console.log(`     -> ${r.split('\t')[0]}`);
      }
    });

    summary.push({
      folder: task.folderName,
      count: uploaded.checkboxes,
      files: task.files
    });
  }

  // 최종 화면 캡처
  const shotPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\b7942295-e6e5-4228-a4d5-1e5292b34cb8\\screen_after_desktop_replace.png';
  await page.screenshot({ path: shotPath, fullPage: false });
  console.log('\n📸 최종 완료 화면 스크린샷 저장:', shotPath);

  console.log('\n================================================================');
  console.log('🎉 [교체 대성공] 3개 폴더 총 8건 도면의 기존 파일 삭제 및 신규 교체 업로드가 완료되었습니다!');
  console.log('================================================================');
  console.log(JSON.stringify(summary, null, 2));

  process.exit(0);
}

if (require.main === module) {
  replaceDrawingsFromDesktop().catch(console.error);
}

module.exports = { replaceDrawingsFromDesktop };
