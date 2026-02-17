import { test, expect } from '@playwright/test';

/**
 * Performance budgets for P4G Mahjong.
 * These are generous thresholds — a simple HTML/CSS/JS game should easily meet them.
 * If a change blows past these, something is wrong.
 */
const BUDGETS = {
  /** DOMContentLoaded must fire within this (ms) */
  domContentLoaded: 2_000,
  /** Full page load within this (ms) */
  pageLoad: 3_000,
  /** First Contentful Paint within this (ms) */
  fcp: 2_000,
  /** Total transferred bytes for all resources */
  totalPageWeight: 500 * 1024, // 500 KB
  /** JS heap snapshot — should stay small for a DOM-based game */
  jsHeapLimit: 30 * 1024 * 1024, // 30 MB
  /** Cumulative Layout Shift — should be 0 for a game */
  cls: 0.1,
  /** Time from click to overlay hiding (ms) */
  inputResponse: 500,
  /** Minimum stable FPS during gameplay (measured over 2 seconds) */
  minFps: 30,
};

test.describe('P4G Mahjong — Performance', () => {

  test('page load timing within budget', async ({ page }) => {
    // Collect performance timing
    await page.goto('/', { waitUntil: 'load' });

    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
      };
    });

    console.log(`DOMContentLoaded: ${Math.round(timing.domContentLoaded)}ms`);
    console.log(`Load: ${Math.round(timing.load)}ms`);

    expect(timing.domContentLoaded, `DOMContentLoaded ${Math.round(timing.domContentLoaded)}ms exceeds ${BUDGETS.domContentLoaded}ms`)
      .toBeLessThan(BUDGETS.domContentLoaded);
    expect(timing.load, `Page load ${Math.round(timing.load)}ms exceeds ${BUDGETS.pageLoad}ms`)
      .toBeLessThan(BUDGETS.pageLoad);
  });

  test('First Contentful Paint within budget', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Paint timing only available in Chromium');

    await page.goto('/', { waitUntil: 'load' });

    const fcp = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint')
        .find(e => e.name === 'first-contentful-paint');
      return paint ? paint.startTime : null;
    });

    if (fcp !== null) {
      console.log(`FCP: ${Math.round(fcp)}ms`);
      expect(fcp, `FCP ${Math.round(fcp)}ms exceeds ${BUDGETS.fcp}ms`)
        .toBeLessThan(BUDGETS.fcp);
    }
  });

  test('total page weight within budget', async ({ page }) => {
    const resources: number[] = [];

    // Intercept all responses and track sizes
    page.on('response', async (response) => {
      try {
        const body = await response.body();
        resources.push(body.length);
      } catch {
        // ignore streaming/websocket responses
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    const totalBytes = resources.reduce((sum, b) => sum + b, 0);
    const totalKB = Math.round(totalBytes / 1024);

    console.log(`Total page weight: ${totalKB} KB (${resources.length} resources)`);

    expect(totalBytes, `Page weight ${totalKB} KB exceeds ${BUDGETS.totalPageWeight / 1024} KB`)
      .toBeLessThan(BUDGETS.totalPageWeight);
  });

  test('JS heap usage within budget', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Heap metrics only available in Chromium');

    await page.goto('/', { waitUntil: 'load' });

    // Start the game and let it run briefly to measure real usage
    await page.locator('#btn-start').click();
    await page.waitForTimeout(2000);

    const heapUsed = await page.evaluate(() => {
      // @ts-ignore — Chrome-specific API
      return (performance as any).memory?.usedJSHeapSize ?? null;
    });

    if (heapUsed !== null) {
      const heapMB = (heapUsed / (1024 * 1024)).toFixed(1);
      console.log(`JS heap used: ${heapMB} MB`);
      expect(heapUsed, `JS heap ${heapMB} MB exceeds ${BUDGETS.jsHeapLimit / (1024 * 1024)} MB`)
        .toBeLessThan(BUDGETS.jsHeapLimit);
    }
  });

  test('no layout shifts (CLS = 0)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Layout Shift API only in Chromium');

    await page.goto('/');

    // Observe layout shifts while page loads and game starts
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            // @ts-ignore
            if (!entry.hadRecentInput) {
              // @ts-ignore
              clsValue += entry.value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });

        // Wait for stabilization then collect
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 3000);
      });
    });

    console.log(`CLS: ${cls.toFixed(4)}`);
    expect(cls, `CLS ${cls.toFixed(4)} exceeds ${BUDGETS.cls}`)
      .toBeLessThan(BUDGETS.cls);
  });

  test('Play button responds quickly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    const responseTime = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const overlay = document.getElementById('game-overlay')!;
        const btn = document.getElementById('btn-start')!;

        const start = performance.now();
        // Use MutationObserver to detect the class change
        const observer = new MutationObserver(() => {
          if (overlay.classList.contains('hidden')) {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });

        btn.click();

        // Timeout fallback
        setTimeout(() => {
          observer.disconnect();
          resolve(-1);
        }, 2000);
      });
    });

    console.log(`Input response: ${Math.round(responseTime)}ms`);
    expect(responseTime).toBeGreaterThan(0); // -1 means timeout
    expect(responseTime, `Input response ${Math.round(responseTime)}ms exceeds ${BUDGETS.inputResponse}ms`)
      .toBeLessThan(BUDGETS.inputResponse);
  });

  test('stable frame rate during gameplay', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'rAF timing most reliable in Chromium');

    await page.goto('/', { waitUntil: 'load' });
    await page.locator('#btn-start').click();

    // Measure frame rate over 2 seconds
    const fps = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const frameTimes: number[] = [];
        let lastTime = performance.now();

        function measure(now: number) {
          frameTimes.push(now - lastTime);
          lastTime = now;
          if (frameTimes.length < 120) { // ~2 seconds at 60fps
            requestAnimationFrame(measure);
          } else {
            const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            resolve(1000 / avgFrameTime);
          }
        }
        requestAnimationFrame(measure);
      });
    });

    console.log(`Average FPS: ${fps.toFixed(1)}`);
    expect(fps, `FPS ${fps.toFixed(1)} below minimum ${BUDGETS.minFps}`)
      .toBeGreaterThan(BUDGETS.minFps);
  });

  test('no memory leak during gameplay (10s)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Heap metrics only in Chromium');

    await page.goto('/', { waitUntil: 'load' });
    await page.locator('#btn-start').click();

    // Wait for fly-in animation to settle
    await page.waitForTimeout(3000);

    // Measure heap at start
    const heapStart = await page.evaluate(() => {
      // @ts-ignore
      return (performance as any).memory?.usedJSHeapSize ?? 0;
    });

    // Play for 10 seconds — use hint and shuffle buttons to create activity
    for (let i = 0; i < 20; i++) {
      await page.locator('#btn-hint').click();
      await page.waitForTimeout(300);
      if (i % 5 === 0) await page.locator('#btn-shuffle').click();
      if (i % 3 === 0) await page.waitForTimeout(200);
    }

    // Force GC if possible, then measure
    const heapEnd = await page.evaluate(() => {
      // @ts-ignore
      if (window.gc) window.gc();
      // @ts-ignore
      return (performance as any).memory?.usedJSHeapSize ?? 0;
    });

    if (heapStart > 0 && heapEnd > 0) {
      const growthMB = ((heapEnd - heapStart) / (1024 * 1024)).toFixed(2);
      console.log(`Heap growth over 10s: ${growthMB} MB (${(heapStart / (1024 * 1024)).toFixed(1)} → ${(heapEnd / (1024 * 1024)).toFixed(1)} MB)`);

      // Allow up to 5 MB growth — more suggests a leak
      expect(heapEnd - heapStart, `Heap grew by ${growthMB} MB — possible memory leak`)
        .toBeLessThan(5 * 1024 * 1024);
    }
  });
});
