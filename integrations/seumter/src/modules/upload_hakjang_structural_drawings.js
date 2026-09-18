const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\##학장동 카페\\허가\\도면\\구조';

// 세움터 표준 구조도면 트리 노드 ID 및 파일 매핑 (총 13개 폴더, 28개 DWG 파일)
const STRUCTURAL_TASKS = [
  {
    folderName: 'S11(기초위치도)',
    nodeId: 'BDS11_anchor',
    files: ['기초구조평면도.dwg']
  },
  {
    folderName: 'S21(평면도)',
    nodeId: 'BDS21_anchor',
    files: [
      '지상1층구조평면도.dwg',
      '지상2층구조평면도-1(1STS.L+4,000).dwg',
      '지상2층구조평면도-2(1STS.L+5,200).dwg',
      '지붕층구조평면도-1(1STS.L+7,400).dwg',
      '지붕층구조평면도-2(1STS.L+10,530).dwg'
    ]
  },
  {
    folderName: 'S32(기둥일람표)',
    nodeId: 'BDS32_anchor',
    files: ['기둥일람표.dwg']
  },
  {
    folderName: 'S33(콘크리트벽일람표)',
    nodeId: 'BDS33_anchor',
    files: [
      '벽체일람표.dwg',
      '지하외벽일람표.dwg'
    ]
  },
  {
    folderName: 'S34(보일람표)',
    nodeId: 'BDS34_anchor',
    files: [
      '보일람표-1.dwg',
      '보일람표-2.dwg'
    ]
  },
  {
    folderName: 'S35(슬래브일람표)',
    nodeId: 'BDS35_anchor',
    files: ['슬래브일람표계단일람표.dwg']
  },
  {
    folderName: 'S40(RC구조상세도)',
    nodeId: 'BDS40_anchor',
    files: ['계단상세도.dwg']
  },
  {
    folderName: 'S50(철골일람표)',
    nodeId: 'BDS50_anchor',
    files: ['임베디드플레이트일람표.dwg']
  },
  {
    folderName: 'S51(철골기둥일람표)',
    nodeId: 'BDS51_anchor',
    files: ['합성기둥일람표.dwg']
  },
  {
    folderName: 'S52(베이스플레이트일람표)',
    nodeId: 'BDS52_anchor',
    files: [
      '베이스플레이트일람표-1.dwg',
      '베이스플레이트일람표-2.dwg',
      '베이스플레이트일람표-3.dwg',
      '베이스플레이트일람표-4.dwg'
    ]
  },
  {
    folderName: 'S55(보접합상세도)',
    nodeId: 'BDS55_anchor',
    files: ['철골보+철근콘크리트보·벽체접합부디테일.dwg']
  },
  {
    folderName: 'S56(기타접합상세도)',
    nodeId: 'BDS56_anchor',
    files: [
      'STEELBOLTCONNECTIONLIST-1.dwg',
      'STEELBOLTCONNECTIONLIST-2.dwg',
      'STEELBOLTCONNECTIONLIST-3.dwg'
    ]
  },
  {
    folderName: 'S91(데크플레이트상세도)',
    nodeId: 'BDS91_anchor',
    files: [
      'N.TDECKS조단면공통도-1.dwg',
      'N.TDECKS조단면공통도-2.dwg',
      'N.TDECKS조단면공통도-3.dwg',
      '철선일체형DECKPLATE단면도-1.dwg',
      '철선일체형DECKPLATE단면도-2.dwg'
    ]
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadHakjangStructuralDrawings() {
  console.log('================================================================');
  console.log('🏛️ [학장동 카페 신축] 세움터 구조도면 정규 폴더 직접 업로드');
  console.log('   - 대상 디렉토리: ' + TARGET_DIR);
  console.log('   - 총 13개 정규 폴더, 28개 DWG 파일');
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

  for (let i = 0; i < STRUCTURAL_TASKS.length; i++) {
    const task = STRUCTURAL_TASKS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${STRUCTURAL_TASKS.length}] 📁 폴더 진입: "${task.folderName}" (Node ID: ${task.nodeId})`);

    // A. jstree 트리 노드 펼치기 및 클릭
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

    // C. 최신 구조도면 파일 경로 수집
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

    // 업로드 완료 대기 (파일당 1.5초 + 기본 2.5초)
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
  const finalShot = path.join(__dirname, '..', '..', 'scratch', 'screen_final_structure_upload.png');
  const fsScratch = path.join(__dirname, '..', '..', 'scratch');
  if (!fs.existsSync(fsScratch)) fs.mkdirSync(fsScratch, { recursive: true });
  await page.screenshot({ path: finalShot, fullPage: false });
  console.log('\n📸 최종 완료 화면 스크린샷 저장:', finalShot);

  console.log('\n================================================================');
  console.log(`🎉 [업로드 완료] 총 ${STRUCTURAL_TASKS.length}개 폴더, ${totalUploaded}건의 구조도면 업로드가 성공적으로 완료되었습니다!`);
  console.log('================================================================');
  console.log(JSON.stringify(uploadReport, null, 2));

  process.exit(0);
}

if (require.main === module) {
  uploadHakjangStructuralDrawings().catch(console.error);
}

module.exports = { uploadHakjangStructuralDrawings, STRUCTURAL_TASKS };
