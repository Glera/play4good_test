import { test, expect } from '@playwright/test';

test.describe('P4G Tetris — Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads without errors', async ({ page }) => {
    // Collect console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Page title
    await expect(page).toHaveTitle(/P4G Tetris/);

    // No JS errors (after page is fully loaded)
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('game canvas is visible', async ({ page }) => {
    const canvas = page.locator('#game-board');
    await expect(canvas).toBeVisible();

    // Canvas has correct dimensions (10 cols * 24px = 240, 20 rows * 24px = 480)
    await expect(canvas).toHaveAttribute('width', '240');
    await expect(canvas).toHaveAttribute('height', '480');
  });

  test('game info displays initial values', async ({ page }) => {
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#level')).toHaveText('1');
    await expect(page.locator('#lines')).toHaveText('0');
  });

  test('start overlay is visible with Play button', async ({ page }) => {
    const overlay = page.locator('#game-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).not.toHaveClass(/hidden/);

    const playBtn = page.locator('#btn-start');
    await expect(playBtn).toBeVisible();
    await expect(playBtn).toHaveText('Play');
  });

  test('Play button starts the game (overlay hides)', async ({ page }) => {
    await page.locator('#btn-start').click();

    const overlay = page.locator('#game-overlay');
    await expect(overlay).toHaveClass(/hidden/);
  });

  test('control buttons are visible', async ({ page }) => {
    await expect(page.locator('#btn-left')).toBeVisible();
    await expect(page.locator('#btn-right')).toBeVisible();
    await expect(page.locator('#btn-down')).toBeVisible();
    await expect(page.locator('#btn-rotate')).toBeVisible();
    await expect(page.locator('#btn-drop')).toBeVisible();
  });

  test('next piece preview canvas exists', async ({ page }) => {
    const nextCanvas = page.locator('#next-piece');
    await expect(nextCanvas).toBeVisible();
    await expect(nextCanvas).toHaveAttribute('width', '96');
    await expect(nextCanvas).toHaveAttribute('height', '96');
  });

  test('control buttons are tappable (44x44 touch target)', async ({ page }) => {
    const buttons = page.locator('.control-btn');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(5);

    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
