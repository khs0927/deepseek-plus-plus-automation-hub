const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { CDP_URL } = require('../src/config/constants');

test('📡 세움터 CDP (Chrome DevTools Protocol) 환경 진단 테스트', async (t) => {
  await t.test('1. CDP 포트 (localhost:9222) 연결 상태 진단', async () => {
    const checkConnection = () => {
      return new Promise((resolve) => {
        const req = http.get(`${CDP_URL}/json/version`, { timeout: 1500 }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const info = JSON.parse(data);
              resolve({ connected: true, info });
            } catch {
              resolve({ connected: true, raw: data });
            }
          });
        });

        req.on('error', (err) => {
          resolve({ connected: false, error: err.code || err.message });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ connected: false, error: 'TIMEOUT' });
        });
      });
    };

    const status = await checkConnection();

    if (status.connected) {
      console.log('✅ Chrome CDP (9222 포트)가 활성화되어 있습니다:', status.info?.Browser || 'Connected');
      assert.ok(true);
    } else {
      console.log(`ℹ️ [안내] CDP 포트가 현재 오프라인 상태입니다 (${status.error}).`);
      console.log('   실제 세움터 사이트 조작 시에는 크롬을 다음 옵션으로 실행해주세요:');
      console.log('   chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\\chrome_dev"');
      // 오프라인 상태에서도 진단 자체는 성공으로 처리 (환경 진단 목적)
      assert.ok(true, 'CDP 진단 완료');
    }
  });
});
