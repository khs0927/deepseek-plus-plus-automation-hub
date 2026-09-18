const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

const targetUrl = 'https://www.eais.go.kr/websquare/websquare.html?w2xPath=/static/ui/cdd/a/a/a01/CDDAAA01P03.xml&mgrNo=202633900001026701600&inqryCode=010600&bizCode=Architecture&recpNo=&clsfCd=1042&optVal=Rename&bimSubmtYn=0';

async function openAndCheck() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();

  // Use page 0 or create new page
  let page = pages.find(p => p.url().includes('CDDAAA01P03'));
  if (!page) {
    page = pages[0];
    console.log('Navigating page 0 to target URL...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('Goto err:', e.message));
  } else {
    console.log('Found existing CDDAAA01P03 page.');
  }

  await page.bringToFront();
  console.log('Waiting 5s for WebSquare components...');
  await new Promise(r => setTimeout(r, 5000));

  const info = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      bodyText: document.body ? document.body.innerText.substring(0, 1000) : '',
      jstreeNodes: Array.from(document.querySelectorAll('.jstree-anchor')).map(a => ({ id: a.id, text: a.innerText })),
      gridRows: Array.from(document.querySelectorAll('tr')).map(tr => tr.innerText.replace(/\s+/g, ' ').trim()).filter(t => t.length > 0 && t.length < 100).slice(0, 30),
      fileInputs: Array.from(document.querySelectorAll('input[type=file]')).length,
      buttons: Array.from(document.querySelectorAll('button, input[type=button], a.w2anchor, .btn')).map(b => (b.innerText || b.value || '').trim()).filter(Boolean)
    };
  });

  console.log('Page Title:', info.title);
  console.log('Page URL:', info.url);
  console.log('JSTree Nodes count:', info.jstreeNodes.length);
  console.log('Sample JSTree Nodes:', info.jstreeNodes.slice(0, 15));
  console.log('Grid Rows (existing files):', info.gridRows);
  console.log('File Inputs:', info.fileInputs);
  console.log('Buttons:', info.buttons);
  console.log('Body Text Snippet:\n', info.bodyText);
}

openAndCheck().catch(console.error);
