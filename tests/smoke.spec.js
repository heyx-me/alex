import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('chat page loads correctly', async ({ page }) => {
  // Construct absolute path to the local file
  // tests/ is inside alex/, so ../index.html is alex/index.html
  const filePath = path.resolve(__dirname, '../index.html');
  await page.goto(`file://${filePath}`);

  // Check the title
  await expect(page).toHaveTitle(/Chat | heyx-me/);

  // Check if the Three.js container exists
  const container = page.locator('#three-container');
  await expect(container).toBeVisible();

  // Check for the header info
  const header = page.locator('#room-title');
  await expect(header).toHaveText('Alex');
});