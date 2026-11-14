import { expect, test, type Page } from '@playwright/test';
import { strokesOnPage } from '../pdfInspect';
import { exportPdf, freshStart, openFile } from './helpers';

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await openFile(page, 'contract.pdf');
  await page.getByRole('button', { name: '畫筆簽名' }).click();
  await expect(page.getByRole('radiogroup', { name: '筆的顏色' })).toBeVisible();
});

/** 在第一頁以相對座標畫一條折線，回傳實際用的相對點 */
async function drawOnPage(page: Page, pts: [number, number][]) {
  const box = (await page.locator('[data-testid="stroke-surface"]').first().boundingBox())!;
  const at = ([u, v]: [number, number]) => [box.x + u * box.width, box.y + v * box.height] as const;
  await page.mouse.move(...at(pts[0]));
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...at(p), { steps: 6 });
  await page.mouse.up();
}

test('畫三筆（黑細／紅粗／藍中）：顏色、粗細、位置存進 PDF；復原一次撤一筆', async ({ page }) => {
  await page.getByRole('radio', { name: '細' }).click();
  await drawOnPage(page, [[0.2, 0.2], [0.5, 0.25]]);
  await page.getByRole('radio', { name: '紅' }).click();
  await page.getByRole('radio', { name: '粗' }).click();
  await drawOnPage(page, [[0.2, 0.4], [0.6, 0.45]]);
  await page.getByRole('radio', { name: '藍' }).click();
  await page.getByRole('radio', { name: '中' }).click();
  await drawOnPage(page, [[0.3, 0.6], [0.7, 0.62]]);
  await expect(page.locator('.stroke-layer path')).toHaveCount(3);

  // 復原：只撤最後一筆
  await page.getByRole('button', { name: '復原' }).click();
  await expect(page.locator('.stroke-layer path')).toHaveCount(2);
  await page.getByRole('radio', { name: '藍' }).click();
  await drawOnPage(page, [[0.3, 0.6], [0.7, 0.62]]);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: '筆的顏色' })).toBeHidden();
  await expect(page.locator('.stroke-layer path')).toHaveCount(3);

  const { bytes } = await exportPdf(page);
  // 原文件自帶的向量線（表格線等）顏色是 #000000／空字串，濾掉，只看畫筆五色
  const PEN = ['#111114', '#d92d20', '#1d4ed8', '#15803d', '#c2410c'];
  const strokes = (await strokesOnPage(bytes, 0)).filter((s) => PEN.includes(s.color));
  expect(strokes.map((s) => s.color)).toEqual(['#111114', '#d92d20', '#1d4ed8']);
  const w = strokes.map((s) => s.width);
  expect(w[0]).toBeLessThan(w[2]);
  expect(w[2]).toBeLessThan(w[1]);
  // 595pt 寬的頁：細 0.25%、中 0.5%、粗 1%
  expect(w[0]).toBeCloseTo(0.0025 * 595, 1);
  expect(w[1]).toBeCloseTo(0.01 * 595, 1);
  expect(w[2]).toBeCloseTo(0.005 * 595, 1);
  // 位置：首尾點與畫的位置一致（pointer 取整容許 0.5%）
  expect(Math.abs(strokes[1].points[0][0] - 0.2)).toBeLessThan(0.005);
  expect(Math.abs(strokes[1].points[0][1] - 0.4)).toBeLessThan(0.005);
  const last = strokes[1].points[strokes[1].points.length - 1];
  expect(Math.abs(last[0] - 0.6)).toBeLessThan(0.005);
  expect(Math.abs(last[1] - 0.45)).toBeLessThan(0.005);
});

test('重新整理後筆跡還在（自動存檔）', async ({ page }) => {
  await page.getByRole('radio', { name: '綠' }).click();
  await drawOnPage(page, [[0.2, 0.3], [0.5, 0.35]]);
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole('button', { name: /繼續上次的文件/ }).click();
  await expect(page.locator('.stroke-layer path')).toHaveCount(1);
  await expect(page.locator('.stroke-layer path')).toHaveAttribute('stroke', '#15803d');
});

test('單點（點一下）會留下一個點', async ({ page }) => {
  const box = (await page.locator('[data-testid="stroke-surface"]').first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await expect(page.locator('.stroke-layer path')).toHaveCount(1);
});
