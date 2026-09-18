const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectDeleteButton() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('CDDAAA01P03')) || context.pages()[0];

  await page.bringToFront();

  const details = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button, a, input[type=button], div.btn, span.btn')).map(el => ({
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      text: (el.innerText || el.value || '').trim()
    })).filter(b => b.text.length > 0 && b.text.length < 30);

    const checkboxes = Array.from(document.querySelectorAll('input[type=checkbox]')).map(cb => ({
      id: cb.id,
      name: cb.name,
      checked: cb.checked,
      className: cb.className
    }));

    const uploaderBoxes = Array.from(document.querySelectorAll('.file_upload, [class*="upload"], [id*="upload"]')).map(el => ({
      id: el.id,
      className: el.className,
      text: el.innerText ? el.innerText.substring(0, 100).replace(/\s+/g, ' ') : ''
    }));

    return {
      title: document.title,
      allButtons,
      checkboxes,
      uploaderBoxes: uploaderBoxes.slice(0, 10)
    };
  });

  console.log('Delete & Action Buttons:', JSON.stringify(details.allButtons.filter(b => b.text.includes('삭제') || b.text.includes('정리') || b.text.includes('숨긴') || b.text.includes('추가')), null, 2));
  console.log('\nCheckboxes count:', details.checkboxes.length);
  console.log('Sample Checkboxes:', details.checkboxes);
}

inspectDeleteButton().catch(console.error);
