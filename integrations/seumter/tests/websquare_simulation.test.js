const test = require('node:test');
const assert = require('node:assert');

test('🧩 WebSquare 데이터 모델 및 체크리스트 처리 로직 시뮬레이션 테스트', async (t) => {
  await t.test('1. 정화조 및 대수선 dataList 데이터 주입 시뮬레이션', () => {
    // WebSquare DataList Mock
    const createMockDataList = () => {
      const data = {};
      return {
        data,
        setCellData: (row, col, val) => {
          data[`${row}_${col}`] = val;
        },
        getCellData: (row, col) => data[`${row}_${col}`],
        set: (col, val) => {
          data[col] = val;
        }
      };
    };

    const dListWclf = createMockDataList();
    const dListImprpr = createMockDataList();
    const dListArch = createMockDataList();

    // 정화조 주입
    dListWclf.setCellData(0, 'wclfModeNm', '단독정화조(부패탱크방법)');
    dListWclf.setCellData(0, 'wclfModeCd', '2001');
    dListWclf.setCellData(0, 'capaPsper', '340');
    dListWclf.setCellData(0, 'reprYn', '1');
    dListWclf.setCellData(0, 'rowStatus', 'C');

    assert.strictEqual(dListWclf.getCellData(0, 'wclfModeNm'), '단독정화조(부패탱크방법)');
    assert.strictEqual(dListWclf.getCellData(0, 'capaPsper'), '340');
    assert.strictEqual(dListWclf.getCellData(0, 'reprYn'), '1');

    // 대수선개요 주입
    dListImprpr.setCellData(0, 'imprprGbNm', '주계단·피난계단 또는 특별피난계단을 증설 또는 해체하거나 수선 또는 변경하는 것');
    dListImprpr.setCellData(0, 'imprprGbCd', '04');
    dListImprpr.setCellData(0, 'imprprChangGbNm', '신설');
    dListImprpr.setCellData(0, 'imprprCntt', '지상 2층~3층 직통계단 신설에 따른 계단 대수선');

    assert.strictEqual(dListImprpr.getCellData(0, 'imprprGbCd'), '04');
    assert.strictEqual(dListImprpr.getCellData(0, 'imprprChangGbNm'), '신설');
    assert.match(dListImprpr.getCellData(0, 'imprprCntt'), /계단 대수선/);

    // 시공기간
    dListArch.set('constPrdYycnt', '1');
    assert.strictEqual(dListArch.data['constPrdYycnt'], '1');
  });

  await t.test('2. 체크리스트 다중 하위구분(Sub-item) 포워드필(Forward-fill) 그룹화 알고리즘 검증', () => {
    // 체크리스트 행 데이터 시뮬레이션
    const rawRows = [
      { lawCol: '건축법제49조', titleCol: '직통계단의 설치', type: '대상', checked: false },
      { lawCol: '', titleCol: '', type: '비대상', checked: false },
      { lawCol: '', titleCol: '피난계단의 구조', type: '대상', checked: false },
      { lawCol: '', titleCol: '', type: '비대상', checked: false },
      { lawCol: '', titleCol: '', type: '대상법규아님', checked: false },
    ];

    // Forward-fill grouping logic
    const groups = [];
    let curGroup = null;

    rawRows.forEach((r, idx) => {
      const txt = r.titleCol.trim();
      const isNewTitle = txt.length > 0 && !['대상', '비대상', '대상법규아님'].includes(txt);

      if (isNewTitle) {
        curGroup = { title: txt, items: [] };
        groups.push(curGroup);
      } else if (!curGroup) {
        curGroup = { title: `auto_group_${idx}`, items: [] };
        groups.push(curGroup);
      }

      curGroup.items.push(r);
    });

    assert.strictEqual(groups.length, 2, '총 2개의 하위구분 그룹으로 분할되어야 합니다.');
    assert.strictEqual(groups[0].title, '직통계단의 설치');
    assert.strictEqual(groups[0].items.length, 2);
    assert.strictEqual(groups[1].title, '피난계단의 구조');
    assert.strictEqual(groups[1].items.length, 3);
  });
});
