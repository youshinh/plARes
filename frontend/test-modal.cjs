const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ['camera', 'microphone']
  });
  const page = await context.newPage();

  await page.goto('http://localhost:3000');

  // Wait for React app to render
  await page.waitForTimeout(2000);

  // Language gate
  try {
    const langBtn = page.locator('button', { hasText: /ENGLISH/i });
    if (await langBtn.count() > 0) {
      await langBtn.first().click();
      await page.waitForTimeout(2000);
    }
  } catch(e) {}

  // FaceScanner gate
  try {
    const skipBtn = page.locator('button', { hasText: 'スキップ →' });
    if (await skipBtn.count() > 0) {
      console.log("Clicking 'Skip ->' in FaceScanner");
      await skipBtn.first().click();
      await page.waitForTimeout(1000);
    }

    const generateBtn = page.locator('#btn-generate-robot');
    if (await generateBtn.count() > 0) {
      console.log("Clicking Generate Robot");
      await generateBtn.first().click();
      await page.waitForTimeout(5000); // wait for generation to finish and transition to arena
    }
  } catch(e) {}

  // Take screenshot of the arena
  await page.screenshot({ path: '/app/frontend/arena_before_share.png' });
  console.log("Screenshot of arena taken.");

  // Looking for 'Share' or 'Share Arena' button
  const shareBtn = page.locator('button', { hasText: /Share/i });
  if (await shareBtn.count() > 0) {
    console.log("Found Share button, clicking it.");
    await shareBtn.first().click({ force: true });
    await page.waitForTimeout(1000);
  } else {
    console.log("No share button found. Bypassing...");
    // maybe it is an icon button? Let's check the code of the Share button.
  }

  // Take screenshot before escape
  await page.screenshot({ path: '/app/frontend/modal_before_esc.png' });
  console.log("Screenshot before escape taken.");

  // Press Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // Take screenshot after escape
  await page.screenshot({ path: '/app/frontend/modal_after_esc.png' });
  console.log("Screenshot after escape taken.");

  await browser.close();
})();
