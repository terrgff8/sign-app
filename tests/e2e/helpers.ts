import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

export async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    for (const name of ['kuaiqian', 'kuaiqian-docs', 'kuaiqian-doc-pdfs', 'kuaiqian-signatures']) {
      await new Promise((r) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = req.onerror = req.onblocked = r;
      });
    }
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '快簽' })).toBeVisible();
}

export async function openFile(page: Page, name: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /開啟檔案/ }).click();
  await (await chooser).setFiles(fixture(name));
  await expect(page.locator('.page').first()).toBeVisible({ timeout: 30_000 });
}

/** 在簽名板畫一筆像簽名的曲線並按完成 */
export async function drawSignature(page: Page) {
  const canvas = page.locator('.pad-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const x0 = box.x + box.width * 0.2;
  const y0 = box.y + box.height * 0.6;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(x0 + i * (box.width * 0.025), y0 - Math.sin(i / 2.5) * box.height * 0.18, { steps: 2 });
  }
  await page.mouse.up();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(canvas).toBeHidden();
}

/** 匯出並回傳下載檔 bytes */
export async function exportPdf(page: Page, opts: { expectWarning?: boolean } = {}) {
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  if (opts.expectWarning) {
    await expect(page.getByText(/個方框沒簽/)).toBeVisible();
    await page.getByRole('button', { name: '仍要儲存' }).click();
  }
  const btn = page.getByRole('button', { name: '儲存 PDF' });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  // 測試瀏覽器沒有系統分享，強制走下載
  await page.evaluate(() => {
    (navigator as unknown as { canShare?: unknown }).canShare = undefined;
  });
  const dl = page.waitForEvent('download');
  await btn.click();
  const download = await dl;
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync(path)) };
}

/** 讀出畫面上某元素的相對位置（%） */
export async function relRect(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const s = (el as HTMLElement).style;
    return { x: parseFloat(s.left) / 100, y: parseFloat(s.top) / 100, w: parseFloat(s.width) / 100, h: parseFloat(s.height) / 100 };
  });
}
