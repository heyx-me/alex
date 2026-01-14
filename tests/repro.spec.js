import { test, expect, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ ...devices['Pixel 5'] }); // Use a mobile device with touch support

test('reproduce undo and delete bugs', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // 1. Load the page
  const filePath = path.resolve(__dirname, '../index.html');
  await page.goto(`file://${filePath}`);
  await page.waitForTimeout(1000);

  // 2. Send a test message
  const messageInput = page.locator('#message-input');
  await messageInput.fill('Test Message for Delete');
  const sendBtn = page.locator('#send-btn');
  await sendBtn.tap(); // Use tap for mobile

  // Wait for message to appear
  const message = page.locator('.message.user', { hasText: 'Test Message for Delete' });
  await expect(message).toBeVisible();

  // 3. Test "Tap deletes" bug (Accidental delete)
  // Tap the message without moving
  await message.tap();
  
  // If the bug exists, the message might be deleted (hidden) or snackbar appears
  // Let's check if snackbar appears
  const snackbar = page.locator('#snackbar');
  const isSnackbarVisibleAfterTap = await snackbar.isVisible();
  
  if (isSnackbarVisibleAfterTap) {
      console.log('BUG REPRODUCED: Tap deleted the message');
  } else {
      console.log('Tap did not delete message (Good)');
  }
  
  // Ensure message is still visible (if tap bug exists, this might fail, but we want to proceed to test Swipe)
  // If tap deleted it, we can't test swipe. So let's reload or resend if needed.
  if (isSnackbarVisibleAfterTap) {
      // Wait for it to disappear or undo it
      // Try to click Undo here if possible to test Undo
      const undoBtn = page.locator('#undo-btn');
      try {
        await undoBtn.click({ timeout: 2000 });
        console.log('Undo clicked successfully after tap');
      } catch (e) {
        console.log('BUG REPRODUCED: Undo button is not clickable (pointer-events issue?)');
      }
      return; // Stop here as we found bugs
  }

  // 4. Test Swipe to Delete
  const box = await message.boundingBox();
  if (!box) throw new Error('Message not found');

  // Perform swipe left
  await page.touchscreen.tap(box.x + box.width - 10, box.y + box.height / 2); // Start
  // Playwright touchscreen api is basic. Let's use mouse emulation which maps to touch in mobile view usually?
  // Actually page.touchscreen.tap just taps. We need to drag.
  // We can dispatch events manually to be sure.
  
  await page.evaluate((el) => {
      const touchStart = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 0, target: el, clientX: 500, clientY: 100 })]
      });
      el.dispatchEvent(touchStart);

      const touchMove = new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 0, target: el, clientX: 200, clientY: 100 })]
      });
      el.dispatchEvent(touchMove);

      const touchEnd = new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 0, target: el, clientX: 200, clientY: 100 })]
      });
      el.dispatchEvent(touchEnd);
  }, await message.elementHandle());

  // 5. Check if deleted
  await expect(snackbar).toBeVisible();
  await expect(message).toBeHidden(); // Or opacity 0

  // 6. Test Undo
  const undoBtn = page.locator('#undo-btn');
  try {
      await undoBtn.click({ timeout: 2000, force: false }); // force: false ensures we check pointer-events
      console.log('Undo clicked successfully');
  } catch (e) {
      console.log('BUG REPRODUCED: Undo button is not clickable');
      throw e;
  }

  // 7. Verify message returns
  await expect(message).toBeVisible();
});