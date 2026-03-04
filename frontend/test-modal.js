const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    permissions: ['camera', 'microphone']
  });
  const page = await context.newPage();

  // Go to localhost:3000
  await page.goto('http://localhost:3000');

  // Wait for the main app to load and the Share Arena button to appear
  await page.waitForTimeout(5000); // Give it some time to load everything

  // Let's check if the share modal is open by default or if we need to click something
  // We can just inject the modal state for testing if needed
  await page.evaluate(() => {
    // Dispatching a custom event or modifying state to open the modal
    // In this case we can try looking for a 'share' button
  });

  // Actually, we can just look for the Share Arena button and click it
  try {
    const shareBtn = await page.locator('text=Share').first();
    if (await shareBtn.count() > 0) {
      await shareBtn.click();
    }
  } catch(e) {
    console.log("No share button found directly", e);
  }

  // Check if modal is open
  const modal = page.locator('.hud-modal-overlay');

  // Take screenshot
  await page.screenshot({ path: 'modal_before_esc.png' });

  // Press Escape
  await page.keyboard.press('Escape');

  // Take another screenshot
  await page.screenshot({ path: 'modal_after_esc.png' });

  await browser.close();
})();
