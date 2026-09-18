const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const userDataDir = 'C:\\chrome_dev';
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

console.log('Launching Chrome with remote debugging on port 9222...');
const child = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'https://cloud.eais.go.kr'
], {
  detached: true,
  stdio: 'inherit'
});

child.unref();

console.log(`Chrome process started (PID: ${child.pid}). Waiting for connection...`);

function checkPort(retry = 10) {
  if (retry <= 0) {
    console.error('Failed to connect to Chrome on port 9222.');
    process.exit(1);
  }

  http.get('http://localhost:9222/json/list', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const tabs = JSON.parse(data);
        console.log('Successfully connected to Chrome!');
        console.log('Active Tabs:');
        tabs.forEach(t => console.log(` - [${t.title}] (${t.url})`));
        process.exit(0);
      } catch (e) {
        console.log('Data received, but failed to parse JSON:', data);
        process.exit(1);
      }
    });
  }).on('error', () => {
    process.stdout.write('.');
    setTimeout(() => checkPort(retry - 1), 1000);
  });
}

setTimeout(() => checkPort(), 1500);
