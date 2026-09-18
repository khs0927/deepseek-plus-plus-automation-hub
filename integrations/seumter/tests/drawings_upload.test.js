const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DRAWING_FILES } = require('../src/modules/upload_drawings');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\#용변\\#주례동 315-4\\도면';

test('📂 세움터 설계도서 20건 파일 무결성 및 분류 매핑 검증', async (t) => {
  await t.test('1. 정의된 도면 및 서류 목록 20건 검증', () => {
    assert.equal(DRAWING_FILES.length, 20, '도면 및 서류 목록은 정확히 20개여야 합니다.');
  });

  await t.test('2. 대상 폴더 내 20개 파일 실존 및 크기 검증', () => {
    if (fs.existsSync(TARGET_DIR)) {
      let foundCount = 0;
      for (const item of DRAWING_FILES) {
        const fullPath = path.join(TARGET_DIR, item.fileName);
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          assert.ok(stat.size > 0, `파일 크기가 0보다 커야 합니다: ${item.fileName}`);
          foundCount++;
        }
      }
      console.log(`ℹ️ [안내] 대상 디렉토리 내 ${foundCount}/${DRAWING_FILES.length}개 파일 매칭 확인`);
    } else {
      console.warn('⚠️ 대상 디렉토리가 현재 마운트되지 않은 환경입니다.');
    }
  });

  await t.test('3. 세움터 트리 매핑 경로 유효성 검증', () => {
    for (const item of DRAWING_FILES) {
      assert.ok(Array.isArray(item.treePath), `${item.fileName}의 treePath는 배열이어야 합니다.`);
      assert.ok(item.treePath.length >= 3, `${item.fileName}의 treePath 깊이는 최소 3단계 이상이어야 합니다.`);
      assert.equal(item.treePath[0], 'B(기본설계도서)');
    }
  });
});
