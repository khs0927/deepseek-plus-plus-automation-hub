const { fillStep1Overview } = require('./step1_overview');
const { fillStep2Floors } = require('./step2_floors');
const { uploadStep3Drawings } = require('./step3_drawings');
const { fillStep4Checklist } = require('./step4_checklist');

async function runBiraPipeline(configPath = null) {
  console.log('================================================================');
  console.log('🏛️ [부산광역시건축사회(BIRA) 한국건축규정 도서검토 파이프라인 시작]');
  console.log('================================================================');

  try {
    console.log('\n[1/4] 1단계: 기본정보 및 건축개요 입력');
    await fillStep1Overview(configPath);

    console.log('\n[2/4] 2단계: 층별 개요 입력');
    await fillStep2Floors(configPath);

    console.log('\n[3/4] 3단계: 도면 및 서류 업로드');
    await uploadStep3Drawings(configPath);

    console.log('\n[4/4] 4단계: 체크리스트 작성');
    await fillStep4Checklist(configPath);

    console.log('\n🎉 [완료] 부산광역시건축사회 도서검토 모든 단계가 성공적으로 처리되었습니다!');
  } catch (err) {
    console.error('❌ BIRA 파이프라인 실행 중 오류 발생:', err.message);
  }
}

if (require.main === module) {
  const configPath = process.argv[2] || null;
  runBiraPipeline(configPath);
}

module.exports = { runBiraPipeline };
