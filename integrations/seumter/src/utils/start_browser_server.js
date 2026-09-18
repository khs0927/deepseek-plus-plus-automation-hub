const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const { EDGE_PATH } = require('../config/constants');

const userDataDir = 'C:\\edge_dev';
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log('Starting persistent Edge browser for Seumter automation...');
console.log(`Executable: ${EDGE_PATH}`);
console.log(`User Data Dir: ${userDataDir}`);

const edgeProcess = spawn(EDGE_PATH, [
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--restore-last-session',
  'https://cloud.eais.go.kr'
]);

edgeProcess.stdout.on('data', (d) => process.stdout.write(`[Edge stdout] ${d}`));
edgeProcess.stderr.on('data', (d) => process.stderr.write(`[Edge stderr] ${d}`));

edgeProcess.on('exit', (code, sig) => {
  console.log(`Edge process exited with code ${code}, signal ${sig}`);
  process.exit(code || 0);
});

function pollCDP() {
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const tabs = JSON.parse(data);
        console.log(`[CDP Server Active] Connected Tabs (${tabs.length}):`);
        tabs.forEach(t => console.log(`  - [${t.title}] -> ${t.url}`));
      } catch (e) {
        console.log('[CDP Server] Raw response:', data);
      }
    });
  }).on('error', (err) => {
    console.log('[CDP Server] Waiting for Edge to bind port 9222...');
  });
}

// Initial check after 2 seconds
setTimeout(pollCDP, 2000);

// Keep event loop alive
setInterval(pollCDP, 30000);
