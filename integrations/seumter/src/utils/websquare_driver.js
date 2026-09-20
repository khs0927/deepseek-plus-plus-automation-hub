/**
 * integrations/seumter/src/utils/websquare_driver.js
 * 세움터(EAIS) & BIRA WebSquare5 전용 자동화 래퍼 드라이버
 */

class WebSquareDriver {
  /**
   * @param {import('playwright').Page} page
   * @param {string} defaultPrefix 기본 WebSquare 프레임 접두어
   */
  constructor(page, defaultPrefix = 'mf_wfm_selfgovn_content_') {
    this.page = page;
    this.prefix = defaultPrefix;
  }

  /**
   * 브라우저 Alert/Confirm 다이얼로그 자동 수락 트랩 설정
   */
  installDialogTrap() {
    this.page.on('dialog', async (dialog) => {
      console.log(`  💬 [WebSquare Dialog] "${dialog.message()}" -> 수락 처리`);
      await dialog.accept().catch(() => {});
    });
  }

  /**
   * 세움터 활성 로그인 세션 검증 (ds_SessionRep 및 오류 방어)
   */
  async verifySessionActive() {
    return await this.page.evaluate(() => {
      const $p = window.$p;
      if (!$p) return { active: false, reason: 'WebSquare5 not initialized' };

      const sessionRep = $p.getComponentById('ds_SessionRep') || window.ds_SessionRep;
      if (!sessionRep) {
        const isLoginRequired = document.body.innerText.includes('로그인') &&
                                !document.body.innerText.includes('로그아웃');
        return { active: !isLoginRequired, reason: isLoginRequired ? 'Session expired' : 'OK' };
      }
      return { active: true, user: sessionRep.get('userNm') || 'Authorized' };
    });
  }

  /**
   * WebSquare 컴포넌트 값 주입 ($p.getComponentById)
   */
  async setValue(compId, value, usePrefix = true) {
    const fullId = usePrefix ? `${this.prefix}${compId}` : compId;
    return await this.page.evaluate(({ id, val }) => {
      const comp = window.$p?.getComponentById(id);
      if (!comp) return { success: false, error: `Component not found: ${id}` };

      if (typeof comp.setValue === 'function') {
        comp.setValue(String(val));
      } else {
        const el = document.getElementById(id);
        if (el) {
          el.value = String(val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      return { success: true };
    }, { id: fullId, val: value });
  }

  /**
   * DataList 셀 데이터 주입 및 행 상태 갱신
   */
  async setCellData(dataListId, rowIndex, columnId, value, usePrefix = true) {
    const fullId = usePrefix ? `${this.prefix}${dataListId}` : dataListId;
    return await this.page.evaluate(({ dlId, row, col, val }) => {
      const dl = window.$p?.getComponentById(dlId) || window[dlId];
      if (!dl) return { success: false, error: `DataList not found: ${dlId}` };

      while (dl.getRowCount() <= row && dl.insertRow) {
        dl.insertRow(row);
      }
      dl.setCellData(row, col, String(val));
      if (typeof dl.setRowStatus === 'function') {
        dl.setRowStatus(row, 'U');
      }
      return { success: true, count: dl.getRowCount() };
    }, { dlId: fullId, row: rowIndex, col: columnId, val: value });
  }

  /**
   * 팝업 창 내 사각형 체크박스 필수 선택 후 [선택/확인] 클릭
   * (세움터 팝업 항목 누락 버그 방지)
   */
  async selectPopupCheckboxAndConfirm(popupContainerSelector, confirmBtnText = '선택') {
    return await this.page.evaluate(async ({ containerSel, btnText }) => {
      const container = document.querySelector(containerSel) || document;

      const checkboxes = container.querySelectorAll('input[type="checkbox"], .w2grid_input_checkbox');
      let checkedCount = 0;
      checkboxes.forEach((cb) => {
        if (!cb.checked) {
          cb.click();
          checkedCount++;
        }
      });

      await new Promise(r => setTimeout(r, 400));

      const buttons = Array.from(container.querySelectorAll('button, input[type="button"], a'));
      const confirmBtn = buttons.find(b => (b.innerText || b.value || '').trim() === btnText);
      if (confirmBtn) {
        confirmBtn.click();
        return { success: true, checkedCount, confirmed: true };
      }
      return { success: false, checkedCount, error: `Confirm button (${btnText}) not found` };
    }, { containerSel: popupContainerSelector, btnText: confirmBtnText });
  }

  /**
   * 도면 삭제 및 덮어쓰기 시 화면 중앙 확인 모달 자동 [예] 클릭
   */
  async handleConfirmModal(expectedAction = '예') {
    await this.page.waitForTimeout(500);
    return await this.page.evaluate((targetText) => {
      const visibleButtons = Array.from(document.querySelectorAll('button, input[type="button"], a')).filter(el => {
        const text = (el.innerText || el.value || '').trim();
        return text === targetText && el.offsetParent !== null;
      });

      if (visibleButtons.length > 0) {
        visibleButtons[0].click();
        return { clicked: true, text: targetText };
      }
      return { clicked: false };
    }, expectedAction);
  }
}

module.exports = { WebSquareDriver };
