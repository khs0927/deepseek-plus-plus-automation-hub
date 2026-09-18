/**
 * 부산광역시건축사회(BIRA) 민원사이트 도서검토 자동화 상수 정의
 * 사이트 URL: https://intra.bira.or.kr/main/review/
 */

module.exports = {
  BIRA_BASE_URL: 'https://intra.bira.or.kr/main/review/',
  BIRA_STEPS: {
    STEP1_OVERVIEW: 'https://intra.bira.or.kr/main/review/write1.php',
    STEP2_FLOORS: 'https://intra.bira.or.kr/main/review/write2.php',
    STEP3_DRAWINGS: 'https://intra.bira.or.kr/main/review/write3.php',
    STEP4_CHECKLIST: 'https://intra.bira.or.kr/main/review/write4.php'
  },
  DEFAULT_ARCHITECT: {
    name: '이동희',
    office: '건축사사무소 지음',
    addr: '부산광역시 사하구 낙동대로 571, 3층',
    tel: '051-791-0201',
    regNo: '23146',
    bizNo: '604-08-99164'
  },
  CDP_ENDPOINT: 'http://localhost:9222'
};
