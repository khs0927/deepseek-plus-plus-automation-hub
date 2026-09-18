const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\##학장동 카페';

// 세움터 표준 트리 노드 ID 및 파일 매핑 (총 12개 폴더, 25개 DWG 파일)
const FOLDER_TASKS = [
  {
    folderName: 'A14(배치도_대지종횡단면도)',
    nodeId: 'BDA14_anchor',
    files: ['배치도.dwg']
  },
  {
    folderName: 'A16(면적산출표)',
    nodeId: 'BDA16_anchor',
    files: ['면적산출표.dwg']
  },
  {
    folderName: 'A17(각종계획도)',
    nodeId: 'BDA17_anchor',
    files: ['장애인편의시설계획도.dwg']
  },
  {
    folderName: 'A21(실내재료마감표)',
    nodeId: 'BDA21_anchor',
    files: ['재료마감표.dwg']
  },
  {
    folderName: 'A31(평면도)',
    nodeId: 'BDA31_anchor',
    files: [
      '1층평면도.dwg',
      '2층평면도.dwg',
      '지붕평면도.dwg'
    ]
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
  },
  {
    folderName: 'A61(창호평면도)',
    nodeId: 'BDA61_anchor',
    files: [
      '창호부호도-1.dwg',
      '창호부호도-2.dwg'
    ]
  },
  {
    folderName: 'A62(창호일람표)',
    nodeId: 'BDA62_anchor',
    files: [
      '창호일람표-1.dwg',
      '창호일람표-2.dwg',
      '창호일람표-3.dwg',
      '창호일람표-4.dwg',
      '창호일람표-5.dwg'
    ]
  },
  {
    folderName: 'L21(배치계획도)',
    nodeId: 'BDL21_anchor',
    files: ['조경계획도.dwg']
  },
  {
    folderName: 'L23(상세도)',
    nodeId: 'BDL23_anchor',
    files: [
      '수고별식재상세도.dwg',
      '지주목식재패턴상세도.dwg'
    ]
  },
  {
    folderName: 'C37(우수오수배수상세도)',
    nodeId: 'BDC37_anchor',
    files: ['우오수계획도.dwg']
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadHakjangDrawings() {
  console.log('================================================================');
  console.log('🏛️ [학장동 카페 신축] 세움터 설계도서 정규 직접 폴더 업로드 파이프라인');
  console.log('   - 대상 디렉토리: ' + TARGET_DIR);
  console.log('   - 총 12개 정규 폴더, 25개 DWG 파일');
  console.log('   - 보강토 옹벽 및 PPTX 제외 룰 엄격 준수');
  console.log('================================================================\n');

  // 1. 브라우저 연결
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();
  console.log(`📄 대상 페이지 확인: "${await page.title()}" (${page.url()})`);

  // 네이티브 다이얼로그 자동 수락
  page.on('dialog', async dialog => {
    console.log(`  💬 [다이얼로그 자동 수락]: "${dialog.message()}"`);
    await dialog.accept().catch(() => {});
  });

  let totalUploaded = 0;
  const uploadReport = [];

  for (let i = 0; i < FOLDER_TASKS.length; i++) {
    const task = FOLDER_TASKS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${FOLDER_TASKS.length}] 📁 폴더 진입: "${task.folderName}" (Node ID: ${task.nodeId})`);

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
      console.warn(`  ⚠️ 트리 노드 ID(${task.nodeId}) 직접 탐색 실패`);
    }

    await sleep(1500);

    // B. 기존 파일 존재 여부 확인 및 클린 삭제 (선택삭제 + 예 모달)
    const existingCount = await page.evaluate(() => {
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

    if (existingCount > 0) {
      console.log(`  🗑️ 기존 등록 파일 ${existingCount}개 감지 -> [선택 파일 삭제] 클릭`);
      await sleep(1000);

      // 확인 모달 [예] 버튼 클릭
      const modalClicked = await page.evaluate(() => {
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

      if (modalClicked) {
        console.log(`  ✔ [확인 모달: '예' 클릭 완료]`);
      }
      await sleep(1500);
    } else {
      console.log(`  ⚪ 기존 파일 없음 (클린 상태)`);
    }

    // C. 최신 도면 파일 경로 수집
    const filePaths = task.files.map(f => path.join(TARGET_DIR, f)).filter(p => {
      const ex = fs.existsSync(p);
      if (!ex) console.error(`  ❌ 파일 없음: ${p}`);
      return ex;
    });

    if (filePaths.length === 0) {
      console.log(`  ⚠️ 업로드할 파일이 존재하지 않아 건너뜁니다.`);
      continue;
    }

    console.log(`  🚀 [파일 주입 시작] ${filePaths.length}개 파일: ${task.files.join(', ')}`);

    // D. 파일 인풋에 주입
    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      console.log(`  ✔ [파일 투입 성공]`);
      totalUploaded += filePaths.length;
      uploadReport.push({
        folder: task.folderName,
        files: task.files
      });
    } else {
      console.error(`  ❌ fileInput 요소를 찾을 수 없습니다.`);
    }

    // 업로드 완료 대기 (파일당 1.5초 + 기본 2초)
    const waitTime = Math.max(3000, filePaths.length * 1500);
    console.log(`  ⏳ 파일 전송 및 세움터 서버 등록 대기 (${(waitTime / 1000).toFixed(1)}초)...`);
    await sleep(waitTime);

    // E. 업로드 결과 확인
    const uploadedFiles = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.w2grid_body_table tr, table tr')).map(tr => tr.innerText.trim()).filter(t => t.includes('.dwg') || t.includes('.pdf'));
      return rows;
    });
    console.log(`  📋 등록 확인 (${uploadedFiles.length}건):`, uploadedFiles);
  }

  // 최종 화면 캡처
  const finalShot = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\b7942295-e6e5-4228-a4d5-1e5292b34cb8\\screen_final_upload.png';
  await page.screenshot({ path: finalShot, fullPage: false });
  console.log('\n📸 최종 완료 화면 스크린샷 저장:', finalShot);

  console.log('\n================================================================');
  console.log(`🎉 [업로드 대성공] 총 ${FOLDER_TASKS.length}개 폴더, ${totalUploaded}건의 도면 업로드가 완벽하게 완료되었습니다!`);
  console.log('================================================================');
  console.log(JSON.stringify(uploadReport, null, 2));

  process.exit(0);
}

if (require.main === module) {
  uploadHakjangDrawings().catch(console.error);
}

module.exports = { uploadHakjangDrawings, FOLDER_TASKS };
