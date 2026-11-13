import { expect, test, type Page } from '@playwright/test';
import { freshStart, openFile, relRect } from './helpers';

/** 用真的觸控事件（CDP）拖曳；只有 Chromium 支援 */
async function touchDrag(page: Page, x: number, y: number, dx: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** 角上可見圓點的中心（＝方框的角） */
async function cornerDot(page: Page, corner: 'tl' | 'br') {
  const b = (await page.locator('.field').first().boundingBox())!;
  return corner === 'tl' ? { x: b.x, y: b.y } : { x: b.x + b.width, y: b.y + b.height };
}

test('觸控：設定方框時按住角上的圓點可自由縮放（不鎖比例）、按住中間可移動', async ({ page }) => {
  test.skip(test.info().project.name !== 'android-chromium', 'CDP 觸控只支援 Chromium');
  await freshStart(page);
  await openFile(page, 'contract.pdf');
  await page.getByRole('tab', { name: /設定方框/ }).click();
  await page.getByRole('button', { name: /新增.*方框/ }).click();

  const r0 = await relRect(page, '.field');
  const br = await cornerDot(page, 'br');
  await touchDrag(page, br.x, br.y, 60, 10); // 主要往右拉：寬變大、高只多一點
  const r1 = await relRect(page, '.field');
  expect(r1.x).toBeCloseTo(r0.x, 4);
  expect(r1.y).toBeCloseTo(r0.y, 4);
  expect(r1.w).toBeGreaterThan(r0.w * 1.3);
  expect(r1.h / r0.h).toBeLessThan(r1.w / r0.w); // 比例沒鎖

  const tl = await cornerDot(page, 'tl');
  await touchDrag(page, tl.x, tl.y, 20, 15); // 左上往內：變小、右下角不動
  const r2 = await relRect(page, '.field');
  expect(r2.x + r2.w).toBeCloseTo(r1.x + r1.w, 4);
  expect(r2.y + r2.h).toBeCloseTo(r1.y + r1.h, 4);
  expect(r2.w).toBeLessThan(r1.w);

  const b = (await page.locator('.field').boundingBox())!;
  await touchDrag(page, b.x + b.width / 2, b.y + b.height / 2, -30, 40); // 中間：移動
  const r3 = await relRect(page, '.field');
  expect(r3.w).toBeCloseTo(r2.w, 4);
  expect(r3.x).toBeLessThan(r2.x);
  expect(r3.y).toBeGreaterThan(r2.y);
});

test('滑鼠／觸控筆：方框四角縮放', async ({ page }) => {
  await freshStart(page);
  await openFile(page, 'contract.pdf');
  await page.getByRole('tab', { name: /設定方框/ }).click();
  await page.getByRole('button', { name: /新增.*方框/ }).click();
  const r0 = await relRect(page, '.field');
  const br = await cornerDot(page, 'br');
  await page.mouse.move(br.x, br.y);
  await page.mouse.down();
  await page.mouse.move(br.x + 50, br.y + 40, { steps: 8 });
  await page.mouse.up();
  const r1 = await relRect(page, '.field');
  expect(r1.w).toBeGreaterThan(r0.w);
  expect(r1.h).toBeGreaterThan(r0.h);
  expect(r1.x).toBeCloseTo(r0.x, 4);
});
