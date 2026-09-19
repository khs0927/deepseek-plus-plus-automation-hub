import net from 'net';
import http from 'http';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function checkPort(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function main() {
  console.log('=======================================================================');
  console.log('         DeepSeek++ Custom (딥식++ 커스텀) - 통합 서비스 시작기');
  console.log('=======================================================================\n');

  // 1. Register Native Messaging Host
  console.log('[1/3] Native Messaging Shell Host 확인 및 등록 중...');
  try {
    const regScript = path.join(__dirname, 'native-host', 'register-host.mjs');
    execSync(`node "${regScript}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error('  - Native Host 등록 실패:', e.message);
  }

  // 2. Check Edge CDP Port 9223
  console.log('\n[2/3] Edge CDP (포트 9223) 연결 상태 확인 중...');
  const cdpActive = await checkPort(9223);
  if (cdpActive) {
    console.log('  -> [OK] Edge Remote Debugging (CDP 9223) 감지됨. 자동 재개 및 감시견 활성화 가능.');
  } else {
    console.log('  -> [안내] Edge 브라우저 디버깅 포트(9223)가 열려있지 않습니다.');
    console.log('     자동 감시견(Watchdog) 브라우저 연동을 원하시면 Edge를 켤 때');
    console.log('     "launch-edge-cdp.bat"을 이용하시거나 --remote-debugging-port=9223 인자를 사용해주세요.');
  }

  // 3. Subagent MCP Server & Watchdog Daemon
  console.log('\n[3/3] Subagent Server & Watchdog Daemon (포트 8932) 확인 중...');
  const subagentActive = await checkPort(8932);
  if (subagentActive) {
    console.log('  -> [OK] Subagent Server & Watchdog Daemon이 이미 백그라운드에서 실행 중입니다 (포트 8932).');
  } else {
    console.log('  -> Subagent Server 백그라운드 구동 시작...');
    const serverPath = path.join(__dirname, 'subagent-mcp', 'server.js');
    const child = spawn('node', [serverPath], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(__dirname, 'subagent-mcp')
    });
    child.unref();

    // Wait a bit and verify
    await new Promise(r => setTimeout(r, 1500));
    const nowActive = await checkPort(8932);
    if (nowActive) {
      console.log('  -> [OK] Subagent Server & Watchdog Daemon 구동 완료 (포트 8932 활성).');
    } else {
      console.log('  -> [WARNING] 서버 구동 신호를 보냈으나 아직 8932 포트 대기 중입니다.');
    }
  }

  console.log('\n=======================================================================');
  console.log('[STATUS] 모든 준비가 완료되었습니다!');
  console.log(' - Shell MCP (Local): 세션 잠금 해제 및 동시 다중 채팅 지원');
  console.log(' - Subagent MCP: 포트 8932 대기 중');
  console.log(' - Session Watchdog: 대화 멈춤 시 자동 재개(Auto-Wakeup) 작동');
  console.log(' - 435개 스킬 및 6개 MCP 기본 번들 탑재');
  console.log('=======================================================================\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
