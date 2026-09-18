const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectPage0() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  await page.bringToFront();

  console.log('Title:', await page.title());
  console.log('URL:', page.url());

  const details = await page.evaluate(() => {
    return {
      bodyText: document.body.innerText,
      allIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id).filter(id => id.length > 0).slice(0, 100),
      forms: Array.from(document.querySelectorAll('form')).map(f => f.id || f.name),
      anchors: Array.from(document.querySelectorAll('a')).map(a => ({ id: a.id, text: a.innerText })).filter(a => a.text.trim().length > 0)
    };
  });

  console.log('BodyText:', details.bodyText.substring(0, 1000));
  console.log('Anchors:', JSON.stringify(details.anchors.slice(0, 30), null, 2));
}

inspectPage0().catch(console.error);
