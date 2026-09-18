module.exports = {
  CDP_URL: 'http://127.0.0.1:9222',
  EDGE_PATH: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  SELECTORS: {
    POPUP_PREFIX: 'mf_wfm_selfgovn_content_wfm_BPMAZS01I01_BPMAZS01P07_wframe',
    MAIN_PREFIX: 'mf_wfm_selfgovn_content_wfm_BPMAZS01I01',
    POPUP_GRID: '#mf_wfm_selfgovn_content_wfm_BPMAZS01I01_BPMAZS01P07_wframe_grd_kcpCeckList_body_table',
    POPUP_SAVE_BTN: '#mf_wfm_selfgovn_content_wfm_BPMAZS01I01_BPMAZS01P07_wframe_btn_save',
    POPUP_NEXT_BTN: '#mf_wfm_selfgovn_content_wfm_BPMAZS01I01_BPMAZS01P07_wframe_btn_Next',
    POPUP_PREV_BTN: '#mf_wfm_selfgovn_content_wfm_BPMAZS01I01_BPMAZS01P07_wframe_btn_prev',
    POPUP_CLOSE_BTN: '#mf_wfm_selfgovn_content_wfm_BPMAZS01I01_BPMAZS01P07_wframe_btn_close',
    MAIN_SAVE_BTN: '#mf_wfm_selfgovn_content_wfm_BPMAZS01I01_trg_KcpRecp_bottomSave'
  },
  // 공사 유형별 법률 판정 룰셋
  PROJECT_TYPES: {
    STAIR_ALTERATION: {
      name: '계단 대수선 (2~3층 직통계단 신설)',
      isBuildingLawApplicable: (lawName, itemTitle) => {
        const full = (lawName + ' ' + itemTitle);
        if (full.includes('제23조') || full.includes('설계자') || full.includes('작성기준') || full.includes('서명날인')) return true;
        if (full.includes('제48조') && (full.includes('구조안전') || full.includes('구조내력') || full.includes('내진'))) return true;
        if (full.includes('제49조') && (full.includes('계단') || full.includes('직통계단') || full.includes('피난') || full.includes('복도') || full.includes('난간') || full.includes('방화구획'))) return true;
        if (full.includes('제50조') && (full.includes('내화구조') || full.includes('방화벽') || full.includes('방화구획'))) return true;
        if (full.includes('제52조') && (full.includes('마감재료') || full.includes('내부마감'))) return true;
        if (full.includes('제52조의2') || full.includes('실내건축')) return true;
        return false;
      },
      isLocationLawApplicable: (lawName, itemTitle) => {
        return false;
      }
    },
    USAGE_CHANGE_ACADEMY: {
      name: '근린생활시설 ➔ 교육연구시설(학원) 용도변경허가',
      isBuildingLawApplicable: (lawName, itemTitle) => {
        const full = (lawName + ' ' + itemTitle);
        // 용도변경 (제19조)
        if (full.includes('제19조') || full.includes('용도변경')) return true;
        // 건축물의 설계 (제23조)
        if (full.includes('제23조') || full.includes('설계자') || full.includes('작성기준') || full.includes('서명날인')) return true;
        // 구조내력 및 내진 (제48조)
        if (full.includes('제48조') && (full.includes('구조안전') || full.includes('구조내력') || full.includes('내진') || full.includes('하중'))) return true;
        // 피난시설, 직통계단, 복도, 출입문 (제49조) - 학원 200㎡ 이상 직통계단 2개소, 복도유효폭 등
        if (full.includes('제49조') && (full.includes('계단') || full.includes('직통계단') || full.includes('피난') || full.includes('복도') || full.includes('출입문') || full.includes('난간') || full.includes('방화구획') || full.includes('거실'))) return true;
        // 내화구조 및 방화구획 (제50조)
        if (full.includes('제50조') && (full.includes('내화구조') || full.includes('방화벽') || full.includes('방화구획'))) return true;
        // 방화지구 (제51조)
        if (full.includes('제51조') && full.includes('방화')) return true;
        // 마감재료의 불연화 (제52조) - 학원 내부마감재료
        if (full.includes('제52조') && (full.includes('마감재료') || full.includes('내부마감') || full.includes('불연') || full.includes('준불연'))) return true;
        // 실내건축 안전기준 (제52조의2)
        if (full.includes('제52조의2') || full.includes('실내건축')) return true;
        // 환기설비 (제53조)
        if (full.includes('제53조') && (full.includes('환기') || full.includes('환기설비'))) return true;
        return false;
      },
      isLocationLawApplicable: (lawName, itemTitle) => {
        // 기존 건축물 내부 전유부 용도변경이므로 입지/신축 규제는 일괄 비대상
        return false;
      }
    }
  }
};
