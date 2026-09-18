const { chromium } = require('playwright');
const { CDP_URL } = require('../config/constants');

async function inspectMainPortal() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url() === 'https://www.eais.go.kr/') || pages[0];

  await page.bringToFront();
  console.log('Inspecting main portal page:', page.url());

  const data = await page.evaluate(() => {
    // Collect all links, menus, buttons, user info
    const allLinks = Array.from(document.querySelectorAll('a, button, li')).map(el => ({
      text: (el.innerText || '').trim().replace(/\s+/g, ' '),
      href: el.getAttribute('href'),
      onclick: el.getAttribute('onclick'),
      className: el.className
    })).filter(x => x.text.length > 0 && x.text.length < 50);

    const userNameEl = document.querySelector('.user_name, .member_name, .user_info, strong.name, .user');
    const myPageSection = document.querySelector('.my_minwon, .my_page, .main_my, #myMinwon');

    return {
      userName: userNameEl ? userNameEl.innerText : 'None',
      myPageText: myPageSection ? myPageSection.innerText.replace(/\s+/g, ' ') : 'None',
      sampleLinks: allLinks.filter(x => x.text.includes('민원') || x.text.includes('마이') || x.text.includes('신청') || x.text.includes('조회') || x.text.includes('작성')).slice(0, 30)
    };
  });

  console.log('Portal Inspection Data:');
  console.log(JSON.stringify(data, null, 2));
}

inspectMainPortal().catch(console.error);
