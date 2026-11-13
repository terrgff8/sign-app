import { expect, test } from '@playwright/test';
import { freshStart, openFile } from './helpers';

test('Word 轉 PDF：中文、表格、分頁都有出來', async ({ page }) => {
  await freshStart(page);
  await openFile(page, 'lease.docx');
  // 檔案內有一個強制分頁 → 2 頁
  await expect(page.locator('.page')).toHaveCount(2);
  await expect(page.locator('.page-number').first()).toHaveText('1 / 2');

  // 第一頁畫布要真的有畫出深色文字像素（不是空白頁）
  const dark = await page.locator('.page-canvas').first().evaluate(async (c: HTMLCanvasElement) => {
    for (let i = 0; i < 40 && c.width === 0; i++) await new Promise((r) => setTimeout(r, 100));
    const ctx = c.getContext('2d')!;
    const d = ctx.getImageData(0, 0, c.width, Math.floor(c.height / 3)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100) n++;
    return n;
  });
  expect(dark).toBeGreaterThan(500);
  await page.screenshot({ path: `test-results/word-${test.info().project.name}.png` });
});
