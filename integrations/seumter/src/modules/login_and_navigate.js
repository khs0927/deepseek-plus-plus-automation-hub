const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0];

    // Register dialog handler to auto-accept all alerts
    page.on('dialog', async dialog => {
        console.log('DIALOG:', dialog.type(), dialog.message());
        await dialog.accept();
    });

    console.log('Current URL:', page.url());

    // Click the login button on the login page
    const loginBtn = page.locator('button.login-btn, button:text("로그인")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loginBtn.click();
        console.log('Clicked login button');
        await page.waitForTimeout(5000);
    } else {
        // Try finding button by text content
        const allButtons = page.locator('button');
        const count = await allButtons.count();
        for (let i = 0; i < count; i++) {
            const text = await allButtons.nth(i).textContent();
            if (text && text.trim().includes('로그인')) {
                await allButtons.nth(i).click();
                console.log('Clicked login button (by scan)');
                await page.waitForTimeout(5000);
                break;
            }
        }
    }

    console.log('After login URL:', page.url());
    console.log('After login Title:', await page.title());

    // Check if we are logged in (not on login page anymore)
    if (page.url().includes('AWPABB01F1') || page.url().includes('login')) {
        console.log('Still on login page or redirecting...');
        await page.waitForTimeout(3000);
    }

    // Navigate to 공사감리자 중간보고 제출 - 허가
    const targetUrl = 'https://www.eais.go.kr/websquare/websquare.html?w2xPath=/static/ui/layout/selfgovn/index.xml&menuId=BPMABA14F01&jobGbCd=KC';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    console.log('Navigated to target URL:', page.url());
    console.log('Title:', await page.title());

    await page.screenshot({ path: 'C:/Users/USER/.gemini/antigravity-ide/brain/00606dd6-f9fd-42f7-ae27-6b76545b1738/after_login.png' });
    console.log('Screenshot saved');
})();
