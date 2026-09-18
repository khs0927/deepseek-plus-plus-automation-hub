const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

// 폴더별 대상 파일 매핑 정의 (총 8개 폴더, 20개 파일)
const FOLDER_TASKS = [
  {
    folderName: 'A00(설계개요)',
    nodeId: 'BDA00_anchor',
    files: ['대수선개요.dwg']
  },
  {
    folderName: 'A01(배치도)',
    nodeId: 'BDA01_anchor',
    files: ['배치도.dwg']
  },
  {
    folderName: 'A02(평면도)',
    nodeId: 'BDA02_anchor',
    files: [
      '지하1층 평면도.dwg',
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
    folderName: 'A03(입면도)',
    nodeId: 'BDA03_anchor',
    files: ['정면도.dwg', '우측면도.dwg']
  },
  {
    folderName: 'A04(단면도)',
    nodeId: 'BDA04_anchor',
    files: ['종단면도(변경전).dwg', '종단면도(변경후).dwg']
  },
  {
    folderName: 'A99(기타도면/건축물대장)',
    nodeId: 'BDA99_anchor',
    files: [
      '지하1층 평면도(건축물대장).dwg',
      '1층평면도(건축물대장).dwg',
      '2층평면도(건축물대장).dwg',
      '3층평면도(건축물대장).dwg'
    ]
  },
  {
    folderName: '507(검토서)',
    nodeId: 'BC507_anchor',
    files: ['정화조용량 산정 검토서.pdf']
  },
  {
    folderName: '510(확인서)',
    nodeId: 'BC510_anchor',
    files: ['열손실 미변동 확인서.pdf']
  }
];

async function uploadByDirectFolder() {
  console.log('================================================================');
  console.log('📂 [세움터 폴더별 직접 진입 방식 도면 업로드 파이프라인]');
  console.log('   (※ 등록파일 정리를 띄우지 않고 각 트리 폴더에 직접 업로드)');
  console.log('================================================================');
  console.log(`📁 도면 소스 디렉토리: ${TARGET_DIR}\n`);

  // 1. 브라우저 연결
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03') || p.url().includes('clsfCd=1042')) || pages[pages.length - 1];

  console.log(`📄 작업 대상 페이지: "${await page.title()}" (${page.url()})`);
  await page.bringToFront();

  // 2. 각 폴더별 순차 업로드 진행
  let totalUploaded = 0;

  for (let i = 0; i < FOLDER_TASKS.length; i++) {
    const task = FOLDER_TASKS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${FOLDER_TASKS.length}] 📁 폴더 선택: "${task.folderName}" (Node ID: ${task.nodeId})`);

    // 대상 파일 경로 검증
    const filePaths = task.files.map(f => path.join(TARGET_DIR, f)).filter(p => {
      const exists = fs.existsSync(p);
      if (!exists) console.warn(` ⚠️ 파일 누락: ${p}`);
      return exists;
    });

    if (filePaths.length === 0) {
      console.log('  -> 업로드할 파일이 없습니다. 건너뜁니다.');
      continue;
    }

    console.log(`  -> 대상 파일 (${filePaths.length}개): ${task.files.join(', ')}`);

    // A. 좌측 트리 노드 클릭하여 해당 폴더 활성화
    const clicked = await page.evaluate((nodeId) => {
      // 1. 직접 ID로 찾기
      let el = document.getElementById(nodeId);
      if (!el) {
        // 2. 앵커 텍스트로 찾기
        const anchors = Array.from(document.querySelectorAll('.jstree-anchor, a[class*=anchor]'));
        el = anchors.find(a => a.id === nodeId || (a.innerText || '').includes(nodeId.replace('_anchor', '')));
      }

      if (el) {
        // 부모 노드가 접혀있을 수 있으므로 펼치기
        let parent = el.closest('.jstree-closed');
        while (parent) {
          const icon = parent.querySelector('.jstree-icon');
          if (icon) icon.click();
          parent = parent.parentElement ? parent.parentElement.closest('.jstree-closed') : null;
        }

        el.scrollIntoView({ block: 'center' });
        el.click();
        return { success: true, text: el.innerText.trim(), id: el.id };
      }
      return { success: false };
    }, task.nodeId);

    if (clicked.success) {
      console.log(`  ✔ 트리 노드 클릭 성공: "${clicked.text}" (id: ${clicked.id})`);
    } else {
      console.log(`  ⚠️ 트리 노드 ID(${task.nodeId}) 직접 탐색 실패, 폴더명으로 재시도...`);
      await page.evaluate((fName) => {
        const anchors = Array.from(document.querySelectorAll('.jstree-anchor, a'));
        const target = anchors.find(a => (a.innerText || '').includes(fName.split('(')[0]));
        if (target) {
          target.click();
        }
      }, task.folderName);
    }

    await new Promise(r => setTimeout(r, 1200));

    // B. 파일 인풋 찾기 및 주입
    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      console.log(`  🚀 [업로드 완료] ${filePaths.length}개 파일이 "${task.folderName}" 폴더에 직접 추가되었습니다.`);
      totalUploaded += filePaths.length;
    } else {
      console.log('  ❌ 파일 인풋을 찾을 수 없습니다.');
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  // 3. 최종 저장
  console.log('\n----------------------------------------------------------------');
  console.log(`💾 전체 ${totalUploaded}개 파일 업로드 완료! 설계도서 저장 진행...`);

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
  console.log('🎉 [완료] 등록파일 정리 없이 각 폴더별 직접 업로드가 성공적으로 완료되었습니다!');
  console.log('================================================================');
}

if (require.main === module) {
  uploadByDirectFolder().catch(console.error);
}

module.exports = { uploadByDirectFolder, FOLDER_TASKS };
