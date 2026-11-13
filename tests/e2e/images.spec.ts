import { expect, test, type Page } from '@playwright/test';
import { imageRectsOnPage } from '../pdfInspect';
import { drawSignature, exportPdf, fixture, freshStart, openFile, relRect } from './helpers';

const close = (a: number, b: number, tol = 0.003) => expect(Math.abs(a - b)).toBeLessThan(tol);

async function pickImages(page: Page, button: string, files: string[]) {
  await page.getByRole('button', { name: '插入圖片' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: new RegExp(button) }).click();
  await (await chooser).setFiles(files.map(fixture));
}

test.beforeEach(async ({ page }) => {
  await freshStart(page);
  await openFile(page, 'contract.pdf');
});

test('疊在頁面上：放到目前頁、可拖移、儲存後位置一致', async ({ page }) => {
  await pickImages(page, '疊在頁面上', ['paper.jpg']);
  const img = page.getByRole('button', { name: '圖片' });
  await expect(img).toHaveCount(1);

  const before = await relRect(page, '.placement');
  const box = (await img.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 - 50, { steps: 8 });
  await page.mouse.up();
  const moved = await relRect(page, '.placement');
  expect(moved.y).toBeLessThan(before.y);
  close(moved.w, before.w);

  const { bytes } = await exportPdf(page);
  const rects = await imageRectsOnPage(bytes, 0);
  expect(rects).toHaveLength(1);
  close(rects[0].x, moved.x);
  close(rects[0].y, moved.y);
  close(rects[0].w, moved.w);
  close(rects[0].h, moved.h);
});

test('加成新頁：插在目前頁後、後面的簽名跟著移；只有插入頁能移除', async ({ page }) => {
  // 在第 2 頁簽名
  await page.locator('.page').nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '＋ 新增簽名' }).click();
  await drawSignature(page);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('.page').nth(1).locator('.placement')).toHaveCount(1);

  // 回第 1 頁，插兩張
  await page.locator('.viewer').evaluate((el) => el.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await pickImages(page, '加成新的一頁', ['paper.jpg', 'paper.jpg']);
  await expect(page.locator('.page')).toHaveCount(5, { timeout: 30_000 });
  await expect(page.getByRole('status')).toContainText('已在第 1 頁後加入 2 頁');
  await expect(page.locator('.page').nth(3).locator('.placement')).toHaveCount(1);
  await expect(page.locator('.remove-page')).toHaveCount(2);
  for (const i of [0, 3, 4]) await expect(page.locator('.page').nth(i).locator('.remove-page')).toHaveCount(0);

  const { bytes } = await exportPdf(page);
  expect(await imageRectsOnPage(bytes, 3)).toHaveLength(1); // 簽名在第 4 頁
  expect(await imageRectsOnPage(bytes, 1)).toHaveLength(1); // 插入的圖片頁
  expect(await imageRectsOnPage(bytes, 0)).toHaveLength(0);

  // 移除兩張插入頁 → 回原狀
  for (let k = 0; k < 2; k++) {
    page.once('dialog', (d) => void d.accept());
    await page.locator('.page').nth(1).locator('.remove-page').click();
    await expect(page.locator('.page')).toHaveCount(4 - k);
  }
  await expect(page.locator('.remove-page')).toHaveCount(0);
  await expect(page.locator('.page').nth(1).locator('.placement')).toHaveCount(1);
  const { bytes: again } = await exportPdf(page);
  expect(await imageRectsOnPage(again, 1)).toHaveLength(1);
});

test('常用文件插頁後「更新」：重新打開有新頁、且變成原文件的一部分', async ({ page }) => {
  await page.getByRole('tab', { name: /設定方框/ }).click();
  await page.getByRole('button', { name: /新增.*方框/ }).click();
  await page.getByRole('button', { name: '存成常用', exact: true }).click();
  await page.getByLabel('常用文件名稱').fill('附件合約');
  await page.getByRole('button', { name: '存成常用文件' }).click();
  await page.getByRole('tab', { name: '簽名' }).click();
  await pickImages(page, '加成新的一頁', ['paper.jpg']);
  await expect(page.locator('.page')).toHaveCount(4, { timeout: 30_000 });
  await page.getByRole('tab', { name: /設定方框/ }).click();
  await page.getByRole('button', { name: '存成常用', exact: true }).click();
  await page.getByRole('button', { name: '更新「附件合約」' }).click();
  await expect(page.getByRole('status')).toContainText('已更新「附件合約」');
  await page.getByRole('button', { name: '回首頁' }).click();
  await expect(page.locator('.saved-doc', { hasText: '4 頁' })).toBeVisible();
  await page.locator('.saved-doc', { hasText: '附件合約' }).click();
  await expect(page.locator('.page')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.locator('.field')).toHaveCount(1);
  await expect(page.locator('.remove-page')).toHaveCount(0);
});
