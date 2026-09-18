const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function openLoginPage() {
  console.log('Connecting to automated Chrome on port 9222...');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  console.log('Navigating to Seumter Login portal...');
  const loginUrl = 'https://cloud.eais.go.kr';

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => {
    console.log('Navigation notice:', e.message);
  });

  await new Promise(r => setTimeout(r, 2000));

  // Bring window to front
  await page.bringToFront();

  // Look for and click '로그인' button if on main page
  await page.evaluate(() => {
    const loginBtn = Array.from(document.querySelectorAll('a, button, span, input')).find(el => {
      const text = (el.innerText || el.value || '').trim();
      return text === '로그인' || text.includes('인증서 로그인') || text.includes('간편인증');
    });
    if (loginBtn) {
      console.log('Clicking login button:', loginBtn.innerText || loginBtn.value);
      loginBtn.click();
    }
  });

  console.log('✅ Seumter Login page is now active and displayed on screen!');
  console.log('Current URL:', page.url());
  console.log('Current Title:', await page.title());
  process.exit(0);
}

openLoginPage().catch(console.error);
