const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  isSeumterUrl,
  normalizeCdpUrl,
  safeScreenshotPath,
  selectSeumterPage,
  validateTarget,
} = require('../src/control/agent_control');

test('agent control accepts only loopback CDP HTTP endpoints', () => {
  assert.equal(normalizeCdpUrl('http://127.0.0.1:9222/'), 'http://127.0.0.1:9222');
  assert.equal(normalizeCdpUrl('http://localhost:9222/json/version'), 'http://localhost:9222');
  assert.throws(() => normalizeCdpUrl('https://127.0.0.1:9222'), /CDP_URL/);
  assert.throws(() => normalizeCdpUrl('http://192.168.0.10:9222'), /CDP_URL/);
});

test('agent control recognizes only EAIS pages', () => {
  assert.equal(isSeumterUrl('https://www.eais.go.kr/moct/awp/abb01/AWPABB01F01'), true);
  assert.equal(isSeumterUrl('https://eais.go.kr/'), true);
  assert.equal(isSeumterUrl('https://www.eais.go.kr.evil.example/'), false);
  assert.equal(isSeumterUrl('https://example.com/websquare.html'), false);
});

test('agent control selects an open EAIS page instead of the first tab', () => {
  const first = { url: () => 'https://example.com/', isClosed: () => false };
  const closedEais = { url: () => 'https://www.eais.go.kr/', isClosed: () => true };
  const activeEais = { url: () => 'https://www.eais.go.kr/moct/', isClosed: () => false };
  assert.equal(selectSeumterPage([first, closedEais, activeEais]), activeEais);
  assert.equal(selectSeumterPage([first]), null);
});

test('agent control requires exactly one click target', () => {
  assert.doesNotThrow(() => validateTarget({ selector: '#save' }));
  assert.doesNotThrow(() => validateTarget({ text: '저장' }));
  assert.throws(() => validateTarget({}), /exactly one/);
  assert.throws(() => validateTarget({ selector: '#save', text: '저장' }), /exactly one/);
});

test('agent control screenshot paths stay inside scratch', () => {
  const scratch = path.resolve('scratch-root');
  assert.equal(safeScreenshotPath('proof.png', scratch), path.join(scratch, 'proof.png'));
  assert.throws(() => safeScreenshotPath('../proof.png', scratch), /escapes/);
  assert.throws(() => safeScreenshotPath('proof.txt', scratch), /\.png/);
});
