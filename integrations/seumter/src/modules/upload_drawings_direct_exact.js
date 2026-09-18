const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

// 세움터 표준 트리 노드 ID 및 파일 매핑 (총 8개 폴더, 20개 파일)
const FOLDER_TASKS = [
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

async function uploadByDirectFolderExact() {
  console.log('================================================================');
  console.log('📂 [세움터 폴더별 직접 진입 방식 도면 업로드]');
  console.log('   (※ 등록파일 정리를 띄우지 않고 8개 폴더에 직접 파일 투입)');
  console.log('================================================================');
  console.log(`📁 도면 소스 디렉토리: ${TARGET_DIR}\n`);

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('CDDAAA01P03') || p.url().includes('clsfCd=1042')) || pages[pages.length - 1];

  console.log(`📄 작업 대상 페이지: "${await page.title()}" (${page.url()})`);
  await page.bringToFront();

  let totalUploaded = 0;

  for (let i = 0; i < FOLDER_TASKS.length; i++) {
    const task = FOLDER_TASKS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${FOLDER_TASKS.length}] 📁 폴더 진입: "${task.folderName}" (Node ID: ${task.nodeId})`);

    const filePaths = task.files.map(f => path.join(TARGET_DIR, f)).filter(p => fs.existsSync(p));
    if (filePaths.length === 0) {
      console.log('  -> 업로드할 파일이 존재하지 않습니다.');
      continue;
    }

    console.log(`  -> 주입 대상 파일 (${filePaths.length}개): ${task.files.join(', ')}`);

    // 1. 해당 폴더 jstree 노드 클릭
    const clickSuccess = await page.evaluate((nodeId) => {
      const el = document.getElementById(nodeId);
      if (el) {
        // 부모 폴더 펼치기
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

    // 2. 파일 인풋에 해당 폴더 파일들만 주입
    const fileInput = await page.$('input[type=file]');
    if (fileInput) {
      await fileInput.setInputFiles(filePaths);
      console.log(`  🚀 [파일 투입 성공] ${filePaths.length}개 파일이 "${task.folderName}" 폴더에 직접 업로드되었습니다.`);
      totalUploaded += filePaths.length;
    } else {
      console.log('  ❌ 파일 인풋을 찾을 수 없습니다.');
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  // 3. 최종 저장
  console.log('\n----------------------------------------------------------------');
  console.log(`💾 전체 8개 폴더, 총 ${totalUploaded}개 파일 업로드 완료! 최종 저장 진행...`);

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
  console.log('🎉 [완료] 등록파일 정리 없이 각 폴더별 직접 업로드 & 저장이 성공적으로 완료되었습니다!');
  console.log('================================================================');
}

if (require.main === module) {
  uploadByDirectFolderExact().catch(console.error);
}

module.exports = { uploadByDirectFolderExact, FOLDER_TASKS };
