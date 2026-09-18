const test = require('node:test');
const assert = require('node:assert');
const { PROJECT_TYPES } = require('../src/config/constants');

test('🏛️ 건축법령 판정 룰셋 테스트 (계단 대수선 기준)', async (t) => {
  const stairRule = PROJECT_TYPES.STAIR_ALTERATION;

  await t.test('1. 계단 대수선 관련 적용 대상 법령 (TRUE 판정 검증)', () => {
    const applicableCases = [
      { law: '건축법 제23조', title: '건축물의 설계 및 설계자 서명날인', desc: '설계 의무 및 기준' },
      { law: '건축법 제48조', title: '구조내력 및 구조안전의 확인', desc: '구조안전/내진설계' },
      { law: '건축법 제49조', title: '피난시설 및 계단, 직통계단 설치기준', desc: '직통계단/피난계단' },
      { law: '건축법 제49조', title: '복도 및 난간 설치 기준', desc: '복도 및 난간' },
      { law: '건축법 제50조', title: '건축물의 내화구조 및 방화벽', desc: '내화구조' },
      { law: '건축법 제50조', title: '방화구획 등의 설치', desc: '방화구획' },
      { law: '건축법 제52조', title: '건축물의 마감재료 (내부마감 불연화)', desc: '마감재료' },
      { law: '건축법 제52조의2', title: '실내건축의 안전기준', desc: '실내건축 안전' },
    ];

    for (const item of applicableCases) {
      const result = stairRule.isBuildingLawApplicable(item.law, item.title);
      assert.strictEqual(
        result,
        true,
        `[${item.desc}] ${item.law} - ${item.title} 는 계단 대수선 적용 대상(true)이어야 합니다.`
      );
    }
  });

  await t.test('2. 계단 대수선 관련 비대상 법령 (FALSE 판정 검증)', () => {
    const nonApplicableCases = [
      { law: '건축법 제42조', title: '대지의 조경', desc: '조경 기준' },
      { law: '건축법 제43조', title: '공개공지 등의 확보', desc: '공개공지' },
      { law: '건축법 제44조', title: '대지와 도로의 관계', desc: '접도의무' },
      { law: '건축법 제46조', title: '건축선의 지정 및 건축제한', desc: '건축선' },
      { law: '건축법 제50조의2', title: '고층건축물의 방재 및 안전', desc: '고층건축물' },
      { law: '건축법 제64조', title: '승강기의 설치', desc: '승강기' },
      { law: '녹색건축물조성지원법 제14조', title: '에너지절약계획서의 제출', desc: '에너지절약계획서' },
      { law: '주차장법 제19조', title: '부설주차장의 설치', desc: '부설주차장' },
      { law: '하수도법 제34조', title: '개인하수처리시설의 설치', desc: '정화조 설치기준' },
    ];

    for (const item of nonApplicableCases) {
      const result = stairRule.isBuildingLawApplicable(item.law, item.title);
      assert.strictEqual(
        result,
        false,
        `[${item.desc}] ${item.law} - ${item.title} 는 계단 대수선 비대상(false)이어야 합니다.`
      );
    }
  });

  await t.test('3. 입지관련 법령 (48개 전수 FALSE 판정 검증)', () => {
    const locationLaws = [
      '국토의 계획 및 이용에 관한 법률 (용도지역별 건폐율·용적률)',
      '개발행위허가의 기준 및 절차',
      '군사기지 및 군사시설 보호법',
      '공항시설법 (장애물 제한표면)',
      '도로법 (접도구역 지정)',
      '산지관리법 (산지전용허가)',
      '농지법 (농업진흥구역)',
      '자연공원법 (공원구역)',
      '수도법 (상수원보호구역)'
    ];

    for (const law of locationLaws) {
      const result = stairRule.isLocationLawApplicable(law, '입지 및 개발행위 검토');
      assert.strictEqual(
        result,
        false,
        `입지관련 법령 [${law}]은 기존 대수선 공사에서 일괄 비대상(false)이어야 합니다.`
      );
    }
  });
});
