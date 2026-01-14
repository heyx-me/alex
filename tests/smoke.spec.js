import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('chat page loads correctly and without errors', async ({ page }) => {
  // Capture console errors and page crashes
  const consoleErrors = [];
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('WebGL') && !text.includes('Shader Error')) {
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', error => {
    consoleErrors.push(error.message);
  });

  // Construct absolute path to the local file
  // tests/ is inside alex/, so ../index.html is alex/index.html
  const filePath = path.resolve(__dirname, '../index.html');
  await page.goto(`file://${filePath}`);

  // Wait for scripts to initialize
  await page.waitForTimeout(2000);

  // Check the title
  await expect(page).toHaveTitle(/Chat | heyx-me/);

  // Check if the Three.js container exists
  const container = page.locator('#three-container');
  await expect(container).toBeVisible();

  // Check for the header info
  // const header = page.locator('#room-title');
  // await expect(header).toHaveText('Alex');

  // Assert no errors occurred
  expect(consoleErrors, `Page had errors: ${consoleErrors.join(', ')}`).toEqual([]);
});