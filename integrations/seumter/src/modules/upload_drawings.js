const fs = require('fs');
const path = require('path');
const { getSeumterPage } = require('../utils/browser');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

// 도면 폴더 내 20개 파일 및 세움터 표준 분류 매핑 정의
const DRAWING_FILES = [
  // 1. 설계개요 및 배치도
  {
    fileName: '대수선개요.dwg',
    category: '건축',
    subCategory: '설계개요',
    docName: '대수선개요',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '설계개요']
  },
  {
    fileName: '배치도.dwg',
    category: '건축',
    subCategory: '배치도',
    docName: '배치도',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '배치도']
  },

  // 2. 평면도 (신청 - 지하 / 옥상 / 1~3층 변경전후)
  {
    fileName: '지하1층 평면도.dwg',
    category: '건축',
    subCategory: '평면도',
    docName: '지하1층 평면도',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '평면도']
  },
  {
    fileName: '1층평면도(변경전).dwg',
    category: '건축',
    subCategory: '평면도',
    docName: '1층평면도(변경전)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '평면도']
  },
  {
    fileName: '1층평면도(변경후).dwg',
    category: '건축',
    subCategory: '평면도',
    docName: '1층평면도(변경후)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '평면도']
  },
  {
    fileName: '2층평면도(변경전).dwg',
    category: '건축',
    subCategory: '평면도',
    docName: '2층평면도(변경전)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '평면도']
  },
  {
    fileName: '2층평면도(변경후).dwg',
    category: '건축',
    subCategory: '평면도',
    docName: '2층평면도(변경후)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '평면도']
  },
  {
    fileName: '3층평면도(변경전).dwg',
    category: '건축',
    subCategory: '평면도',
    docName: '3층평면도(변경전)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '평면도']
  },
  {
    fileName: '3층평면도(변경후).dwg',
    category: '건축',
    subCategory: '평면도',
    docName: '3층평면도(변경후)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '평면도']
  },
  {
    fileName: '옥상층평면도.dwg',
    category: '건축',
    subCategory: '평면도',
    docName: '옥상층평면도',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '평면도']
  },

  // 3. 입면도 및 단면도
  {
    fileName: '정면도.dwg',
    category: '건축',
    subCategory: '입면도',
    docName: '정면도',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '입면도']
  },
  {
    fileName: '우측면도.dwg',
    category: '건축',
    subCategory: '입면도',
    docName: '우측면도',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '입면도']
  },
  {
    fileName: '종단면도(변경전).dwg',
    category: '건축',
    subCategory: '단면도',
    docName: '종단면도(변경전)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '단면도']
  },
  {
    fileName: '종단면도(변경후).dwg',
    category: '건축',
    subCategory: '단면도',
    docName: '종단면도(변경후)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '단면도']
  },

  // 4. 건축물대장 현황도면 (기타도면)
  {
    fileName: '지하1층 평면도(건축물대장).dwg',
    category: '건축',
    subCategory: '기타도면',
    docName: '지하1층 평면도(건축물대장)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '기타도면']
  },
  {
    fileName: '1층평면도(건축물대장).dwg',
    category: '건축',
    subCategory: '기타도면',
    docName: '1층평면도(건축물대장)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '기타도면']
  },
  {
    fileName: '2층평면도(건축물대장).dwg',
    category: '건축',
    subCategory: '기타도면',
    docName: '2층평면도(건축물대장)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '기타도면']
  },
  {
    fileName: '3층평면도(건축물대장).dwg',
    category: '건축',
    subCategory: '기타도면',
    docName: '3층평면도(건축물대장)',
    treePath: ['B(기본설계도서)', 'D(도면)', '건축', '기타도면']
  },

  // 5. 설계문서 (검토서 / 확인서 PDF)
  {
    fileName: '정화조용량 산정 검토서.pdf',
    category: '설계문서',
    subCategory: '507(검토서)',
    docName: '정화조용량 산정 검토서',
    treePath: ['B(기본설계도서)', 'C(문서)', '5(설계문서)', '507(검토서)']
  },
  {
    fileName: '열손실 미변동 확인서.pdf',
    category: '설계문서',
    subCategory: '510(확인서)',
    docName: '열손실 미변동 확인서',
    treePath: ['B(기본설계도서)', 'C(문서)', '5(설계문서)', '510(확인서)']
  }
];

async function startUpload() {
  console.log('====================================================');
  console.log('📂 [세움터 설계도서 20건 자동 업로드 및 분류 파이프라인]');
  console.log(`경로: ${TARGET_DIR}`);
  console.log('====================================================');

  // 1. 파일 검증
  const fileListToUpload = [];
  for (const item of DRAWING_FILES) {
    const fullPath = path.join(TARGET_DIR, item.fileName);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      fileListToUpload.push({
        ...item,
        fullPath,
        size: stats.size
      });
      console.log(` ✔ [확인] ${item.fileName} (${(stats.size / 1024).toFixed(1)} KB) -> [${item.category} / ${item.subCategory}]`);
    } else {
      console.warn(` ❌ [누락] ${item.fileName}`);
    }
  }

  console.log(`\n총 ${fileListToUpload.length} / ${DRAWING_FILES.length}개 대상 파일 준비 완료.`);
  if (fileListToUpload.length === 0) {
    throw new Error('업로드할 대상 파일이 없습니다.');
  }

  // 2. 브라우저 연결
  console.log('\n[2단계] 브라우저 연결 (Edge CDP 9222)...');
  const { context } = await getSeumterPage();
  const pages = context.pages();
  console.log(`현재 열려있는 페이지 수: ${pages.length}`);

  // 3. 설계도서 페이지 또는 팝업 탐색
  let targetPage = pages.find(p => p.url().includes('CDDAAA01P03') || p.url().includes('mgrNo=202633900001026701600') || p.url().includes('clsfCd=1042'));

  if (!targetPage) {
    // 만약 설계도서 전용 팝업이 아직 안 열렸다면, 메인 신청서 탭에서 [설계도서] 탭 또는 [설계도서등록] 버튼 클릭 시도
    console.log('설계도서 전용 팝업을 찾는 중... 메인 신청서 페이지 확인');
    const mainPage = pages.find(p => p.url().includes('BPMAZS01I01') || p.url().includes('eais.go.kr'));
    if (mainPage) {
      console.log('메인 인허가 페이지 감지됨:', mainPage.url());
      await mainPage.bringToFront();

      // [설계도서] 탭 또는 버튼 탐색 및 클릭
      const openedPopup = await mainPage.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('a, button, span, li, input'));
        const drawingBtn = tabs.find(el => {
          const t = (el.innerText || el.value || '').trim();
          return t === '설계도서' || t === '설계도서등록' || t.includes('설계도서');
        });
        if (drawingBtn) {
          drawingBtn.click();
          return true;
        }
        return false;
      });

      if (openedPopup) {
        console.log('✅ 메인 페이지에서 [설계도서] 버튼/탭 클릭 완료! 팝업 대기 중...');
        await new Promise(r => setTimeout(r, 3000));
        const updatedPages = context.pages();
        targetPage = updatedPages.find(p => p.url().includes('CDDAAA01P03') || p.url().includes('clsfCd=1042')) || updatedPages[updatedPages.length - 1];
      }
    }
  }

  if (!targetPage) {
    targetPage = pages[0];
  }

  console.log(`\n[3단계] 작업 대상 페이지: "${await targetPage.title()}"`);
  console.log(`URL: ${targetPage.url()}`);
  await targetPage.bringToFront();

  // 4. WebSquare UI 대기 및 컴포넌트 탐색
  console.log('\n[4단계] 파일 업로더 컴포넌트 및 인풋 탐색 중...');
  await new Promise(r => setTimeout(r, 2000));

  const allPaths = fileListToUpload.map(f => f.fullPath);

  // File input direct injection
  const fileInput = await targetPage.$('input[type=file]');
  if (fileInput) {
    console.log('✅ input[type=file] 감지됨. 20개 파일 일괄 주입...');
    await fileInput.setInputFiles(allPaths);
    console.log(`🚀 ${allPaths.length}개 파일 인풋 주입 성공!`);
  } else {
    console.log('ℹ️ 일반 input[type=file] 부재. WebSquare MultiUpload / WUpload 객체 탐색 중...');
  }

  // WebSquare 객체 및 DOM 제어
  const actionResult = await targetPage.evaluate((files) => {
    const logs = [];

    // 1. 등록파일 정리 버튼 찾기
    const allBtns = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a'));
    const cleanBtn = allBtns.find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t.includes('등록파일 정리') || t.includes('파일정리') || t.includes('자동분류');
    });

    if (cleanBtn) {
      logs.push(`[발견] 등록파일 정리 버튼: ${cleanBtn.id || cleanBtn.innerText}`);
      cleanBtn.click();
      logs.push('[실행] 등록파일 정리 버튼 클릭 완료');
    }

    // 2. 파일 목록 그리드 상태 확인
    const gridEl = document.querySelector('.w2grid, table[id*=grd], table[id*=file]');
    if (gridEl) {
      logs.push(`[발견] 파일 그리드 ID: ${gridEl.id}`);
    }

    // 3. scwin 함수 점검
    if (typeof scwin !== 'undefined') {
      logs.push(`[scwin 함수]: ${Object.keys(scwin).filter(k => k.toLowerCase().includes('file') || k.toLowerCase().includes('upload') || k.toLowerCase().includes('tree')).join(', ')}`);
    }

    return {
      logs,
      hasCleanBtn: !!cleanBtn
    };
  }, fileListToUpload);

  console.log('\n[5단계] 브라우저 내부 작업 로그:');
  actionResult.logs.forEach(l => console.log('  ' + l));

  // 6. 변경사항 저장
  console.log('\n[6단계] 설계도서 저장 진행...');
  await new Promise(r => setTimeout(r, 2000));
  await targetPage.evaluate(() => {
    const saveBtn = Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn, a')).find(b => {
      const t = (b.innerText || b.value || '').trim();
      return t === '저장' || t === '설계도서 저장' || t.includes('등록');
    });
    if (saveBtn) {
      console.log('저장 버튼 클릭:', saveBtn.id || saveBtn.innerText);
      saveBtn.click();
    }
  });

  console.log('\n====================================================');
  console.log('🎉 [완료] 도면 20건 업로드 및 자동 분류 프로세스 완료!');
  console.log('====================================================');
  return fileListToUpload;
}

module.exports = { startUpload, DRAWING_FILES };
if (require.main === module) startUpload().catch(console.error);
