import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('=======================================================================');
console.log('       DeepSeek++ Custom (딥식++ 커스텀) - 통합 설치 & 초기 설정');
console.log('=======================================================================\n');

console.log(`[1/3] Node.js 환경 감지: ${process.version} (정상)`);

console.log('\n[2/3] Native Messaging Shell Host 등록 중...');
try {
  const regScript = path.join(__dirname, 'native-host', 'register-host.mjs');
  execSync(`node "${regScript}"`, { stdio: 'inherit' });
} catch (e) {
  console.error('  - Native Host 등록 중 오류 발생:', e.message);
}

const extPath = path.join(__dirname, 'extension');

console.log('\n=======================================================================');
console.log('[3/3] 브라우저 확장 프로그램(Extension) 로드 가이드:');
console.log('=======================================================================');
console.log(' 1. Microsoft Edge를 열고 주소창에 edge://extensions 입력');
console.log('    (Chrome 사용 시: chrome://extensions)');
console.log(' 2. 화면의 [개발자 모드 (Developer Mode)] 스위치를 켭니다.');
console.log(' 3. [압축을 풀지 않은 확장 로드 (Load unpacked)] 버튼을 클릭합니다.');
console.log(' 4. 아래 폴더 경로를 선택하여 등록합니다:');
console.log(`\n    📂  ${extPath}\n`);
console.log(' * 주의: 기존 스토어 버전 DeepSeek++가 있다면 충돌 방지를 위해 꺼두세요.');
console.log(' * 완료 후 [start-all-services.bat]을 실행하시면 모든 준비가 끝납니다.');
console.log('=======================================================================\n');
