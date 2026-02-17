import { test, expect } from '@playwright/test';

test.describe('P4G Mahjong — Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads without errors', async ({ page }) => {
    // Collect console errors, filtering out Telegram SDK errors (CDN may fail in tests)
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('telegram.org') && !text.includes('Telegram')) {
          errors.push(text);
        }
      }
    });

    // Page title
    await expect(page).toHaveTitle(/P4G Mahjong/);

    // No JS errors (after page is fully loaded)
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('game board area is visible', async ({ page }) => {
    // The board container is always visible; tiles render inside #game-board after Play
    const boardArea = page.locator('.game-board-area');
    await expect(boardArea).toBeVisible();

    // The #game-board element exists in DOM
    const board = page.locator('#game-board');
    await expect(board).toBeAttached();
  });

  test('game info displays initial values', async ({ page }) => {
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#level-value')).toHaveText('1');
    await expect(page.locator('#moves')).toHaveText('0');
    await expect(page.locator('#tiles-left')).toHaveText('144');
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

  test('footer buttons are visible', async ({ page }) => {
    await expect(page.locator('#btn-shuffle')).toBeVisible();
    await expect(page.locator('#btn-hint')).toBeVisible();
    await expect(page.locator('#btn-autoplay')).toBeVisible();
  });

  test('footer buttons are tappable (44x44 touch target)', async ({ page }) => {
    const buttons = page.locator('.footer-btn-circle');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
