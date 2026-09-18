const test = require('node:test');
const assert = require('node:assert');
const constants = require('../src/config/constants');
const seumterIndex = require('../src/index');

test('⚙️ 모듈 로딩 및 설정 무결성 테스트', async (t) => {
  await t.test('1. constants.js 설정값 유효성 검증', () => {
    assert.ok(constants.CDP_URL, 'CDP_URL이 정의되어 있어야 합니다.');
    assert.strictEqual(typeof constants.CDP_URL, 'string');
    assert.match(constants.CDP_URL, /^http:\/\//);

    assert.ok(constants.SELECTORS, 'SELECTORS가 정의되어 있어야 합니다.');
    const expectedKeys = [
      'POPUP_PREFIX',
      'MAIN_PREFIX',
      'POPUP_GRID',
      'POPUP_SAVE_BTN',
      'POPUP_NEXT_BTN',
      'POPUP_PREV_BTN',
      'POPUP_CLOSE_BTN',
      'MAIN_SAVE_BTN'
    ];

    for (const key of expectedKeys) {
      assert.ok(constants.SELECTORS[key], `SELECTORS.${key}가 정의되어 있어야 합니다.`);
      assert.strictEqual(typeof constants.SELECTORS[key], 'string');
      assert.ok(constants.SELECTORS[key].length > 0, `SELECTORS.${key}는 빈 문자열이 아니어야 합니다.`);
    }
  });

  await t.test('2. index.js 진입점 export 함수 검증', () => {
    assert.strictEqual(typeof seumterIndex.runFullPipeline, 'function');
    assert.strictEqual(typeof seumterIndex.runAllChecklists, 'function');
    assert.strictEqual(typeof seumterIndex.runBuildingChecklist, 'function');
    assert.strictEqual(typeof seumterIndex.runLocationChecklist, 'function');
    assert.strictEqual(typeof seumterIndex.handlePermitInspectionSign, 'function');
  });

  await t.test('3. 개별 모듈 require 무결성 검증', () => {
    assert.doesNotThrow(() => require('../src/modules/pipeline'));
    assert.doesNotThrow(() => require('../src/modules/building_overview'));
    assert.doesNotThrow(() => require('../src/modules/checklist_all'));
    assert.doesNotThrow(() => require('../src/modules/checklist_building'));
    assert.doesNotThrow(() => require('../src/modules/checklist_location'));
    assert.doesNotThrow(() => require('../src/modules/permit_inspection'));
    assert.doesNotThrow(() => require('../src/utils/browser'));
  });
});
