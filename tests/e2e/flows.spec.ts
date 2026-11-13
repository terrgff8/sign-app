import { expect, test, type Page } from '@playwright/test';
import { imageRectsOnPage } from '../pdfInspect';
import { drawSignature, exportPdf, fixture, freshStart, openFile, relRect } from './helpers';

const close = (a: number, b: number, tol = 0.003) => expect(Math.abs(a - b)).toBeLessThan(tol);

async function expectSameRect(actual: { x: number; y: number; w: number; h: number }, expected: typeof actual) {
  close(actual.x, expected.x);
  close(actual.y, expected.y);
  close(actual.w, expected.w);
  close(actual.h, expected.h);
}

async function dragBy(page: Page, selector: string, dx: number, dy: number) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await freshStart(page);
});

test('PDF 自由簽：拖移、縮放、復原、匯出位置與畫面一致', async ({ page }) => {
  await openFile(page, 'contract.pdf');
  await expect(page.locator('.page')).toHaveCount(3);

  await page.getByRole('button', { name: '＋ 新增簽名' }).click();
  await page.getByLabel('存到我的簽名').check();
  await drawSignature(page);
  await expect(page.locator('.placement')).toHaveCount(1);
  // 「已存到我的簽名」提示不能擋住底下的點擊
  await expect(page.getByRole('status')).toHaveCSS('pointer-events', 'none');

  const before = await relRect(page, '.placement');
  await dragBy(page, '.placement', -40, 60);
  const moved = await relRect(page, '.placement');
  expect(moved.x).toBeLessThan(before.x);
  expect(moved.y).toBeGreaterThan(before.y);
  close(moved.w, before.w);

  // 拉右下角放大，比例要維持
  // 拉把可能被拖到工具列後面，先捲進畫面
  await page.locator('.handle-br').scrollIntoViewIfNeeded();
  const handle = (await page.locator('.handle-br').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 50, handle.y + 30, { steps: 8 });
  await page.mouse.up();
  const resized = await relRect(page, '.placement');
  expect(resized.w).toBeGreaterThan(moved.w);
  close(resized.w / resized.h, moved.w / moved.h, 0.02);

  await page.getByRole('button', { name: '復原' }).click();
  await expectSameRect(await relRect(page, '.placement'), moved);

  const { name, bytes } = await exportPdf(page);
  expect(name).toBe('contract-已簽.pdf');
  const [r] = await imageRectsOnPage(bytes, 0);
  await expectSameRect(r, moved);
});

test('旋轉 90° 的頁面簽名，匯出後位置正確；已存簽名可重複使用', async ({ page }) => {
  await openFile(page, 'contract.pdf');
  await page.getByRole('button', { name: '＋ 新增簽名' }).click();
  await page.getByLabel('存到我的簽名').check();
  await drawSignature(page);

  await page.getByRole('button', { name: '完成', exact: true }).click();
  // 捲到底，讓畫面中線落在第 3 頁（目前頁）
  await page.locator('.viewer').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '＋ 新增簽名' }).click();
  // 有存過簽名 → 先出現簽名庫
  await page.getByRole('button', { name: '使用這個簽名' }).first().click();
  const onRotated = page.locator('.page').nth(2).locator('.placement');
  await expect(onRotated).toHaveCount(1);
  const rect = await onRotated.evaluate((el) => {
    const s = (el as HTMLElement).style;
    return { x: parseFloat(s.left) / 100, y: parseFloat(s.top) / 100, w: parseFloat(s.width) / 100, h: parseFloat(s.height) / 100 };
  });
  const { bytes } = await exportPdf(page);
  const [r] = await imageRectsOnPage(bytes, 2);
  await expectSameRect(r, rect);
});

test('Word＋方框＋兩人輪流簽：自動填入方框、依序交接、匯出無警告', async ({ page }) => {
  await openFile(page, 'lease.docx');
  await page.getByRole('tab', { name: /設定方框/ }).click();

  await page.getByRole('button', { name: /新增.*方框/ }).click(); // 自動建立「甲方」
  await page.getByRole('button', { name: '編輯簽署人' }).click();
  await page.getByRole('button', { name: '＋ 乙方' }).click();
  await page.getByRole('dialog', { name: '簽署人' }).getByRole('button', { name: '關閉' }).click();
  await page.getByRole('button', { name: '＋ 新增「乙方」的方框' }).click();
  await expect(page.locator('.field')).toHaveCount(2);

  await page.getByRole('tab', { name: '簽名' }).click();
  await page.getByRole('button', { name: /輪流簽署（2 格）/ }).click();
  await expect(page.locator('.guided-who')).toContainText('甲方');

  // 點到別人的格子會提示
  await page.locator('.field.is-other').click();
  await expect(page.getByRole('status')).toContainText('這格是「乙方」要簽的');

  await page.getByRole('button', { name: '簽下一格' }).click();
  await expect(page.locator('.pad-title')).toContainText('甲方');
  await drawSignature(page);

  // 簽名等比放進甲方方框內、置中
  const field = await relRect(page, '.field');
  const sig = await relRect(page, '.placement');
  expect(sig.x).toBeGreaterThanOrEqual(field.x - 1e-6);
  expect(sig.y).toBeGreaterThanOrEqual(field.y - 1e-6);
  expect(sig.x + sig.w).toBeLessThanOrEqual(field.x + field.w + 1e-6);
  expect(sig.y + sig.h).toBeLessThanOrEqual(field.y + field.h + 1e-6);
  close(sig.x + sig.w / 2, field.x + field.w / 2);
  close(sig.y + sig.h / 2, field.y + field.h / 2);

  await page.getByRole('button', { name: '完成，交給「乙方」' }).click();
  await expect(page.locator('.guided-who')).toContainText('乙方');
  await page.locator('.field.is-current').click();
  await drawSignature(page);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('全部簽完了');

  const { bytes } = await exportPdf(page);
  expect((await imageRectsOnPage(bytes, 0)).length).toBeGreaterThanOrEqual(2);
});

test('方框沒簽完匯出會警告；簽名放進方框後仍可放大到框外', async ({ page }) => {
  await openFile(page, 'contract.pdf');
  await page.getByRole('tab', { name: /設定方框/ }).click();
  await page.getByRole('button', { name: /新增.*方框/ }).click();
  await page.getByRole('button', { name: /新增.*方框/ }).click();
  await page.getByRole('tab', { name: '簽名' }).click();

  await page.locator('.field').first().click();
  await drawSignature(page);
  const field = await relRect(page, '.field');
  await page.locator('.placement').click();
  // 拉把可能被拖到工具列後面，先捲進畫面
  await page.locator('.handle-br').scrollIntoViewIfNeeded();
  const handle = (await page.locator('.handle-br').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 90, handle.y + 60, { steps: 8 });
  await page.mouse.up();
  const sig = await relRect(page, '.placement');
  expect(sig.x + sig.w).toBeGreaterThan(field.x + field.w);

  const { bytes } = await exportPdf(page, { expectWarning: true });
  expect(await imageRectsOnPage(bytes, 0)).toHaveLength(1);
});

/** 開 PDF、放甲乙兩個方框、存成常用文件，回首頁；回傳方框位置 */
async function createSavedDoc(page: Page, name: string) {
  await openFile(page, 'contract.pdf');
  await page.getByRole('tab', { name: /設定方框/ }).click();
  await page.getByRole('button', { name: /新增.*方框/ }).click();
  await page.getByRole('button', { name: '編輯簽署人' }).click();
  await page.getByRole('button', { name: '＋ 乙方' }).click();
  await page.getByRole('dialog', { name: '簽署人' }).getByRole('button', { name: '關閉' }).click();
  await page.getByRole('button', { name: '＋ 新增「乙方」的方框' }).click();
  const positions = await fieldPositions(page);
  await page.getByRole('button', { name: '存成常用', exact: true }).click();
  await page.getByLabel('常用文件名稱').fill(name);
  await page.getByRole('button', { name: '存成常用文件' }).click();
  await expect(page.getByRole('status')).toContainText(`已存成常用文件「${name}」`);
  await page.getByRole('button', { name: '回首頁' }).click();
  await expect(page.getByRole('heading', { name: '常用文件' })).toBeVisible();
  return positions;
}

const fieldPositions = (page: Page) =>
  page.locator('.field').evaluateAll((els) =>
    els.map((e) => {
      const s = (e as HTMLElement).style;
      return [s.left, s.top, s.width, s.height].join(' ');
    }),
  );

test('常用文件：存一次，之後首頁點開直接簽；常用文件本身保持空白', async ({ page }) => {
  const positions = await createSavedDoc(page, '租約');

  await page.getByRole('button', { name: /^租約/ }).click();
  await expect(page.locator('.field')).toHaveCount(2);
  await expect(page.locator('.placement')).toHaveCount(0);
  expect(await fieldPositions(page)).toEqual(positions);

  await page.getByRole('button', { name: /輪流簽署（2 格）/ }).click();
  await page.getByRole('button', { name: '簽下一格' }).click();
  await drawSignature(page);
  await page.getByRole('button', { name: '完成，交給「乙方」' }).click();
  await page.locator('.field.is-current').click();
  await drawSignature(page);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const { name, bytes } = await exportPdf(page);
  expect(name).toBe('租約-已簽.pdf');
  expect(await imageRectsOnPage(bytes, 0)).toHaveLength(2);

  // 再開一次：要是乾淨的（上次有簽名 → 先問是否取代）
  await page.getByRole('button', { name: '回首頁' }).click();
  const dialog = page.waitForEvent('dialog');
  const click = page.getByRole('button', { name: /^租約/ }).click();
  const d = await dialog;
  expect(d.message()).toContain('取代上次');
  await d.accept();
  await click;
  await expect(page.locator('.field')).toHaveCount(2);
  await expect(page.locator('.placement')).toHaveCount(0);
});

test('常用文件：從它開啟後可更新方框，或另存新的一份', async ({ page }) => {
  await createSavedDoc(page, '租約');
  await page.getByRole('button', { name: /^租約/ }).click();
  await page.getByRole('tab', { name: /設定方框/ }).click();
  await page.locator('.field').first().click();
  await page.getByRole('button', { name: '刪除' }).click();
  await page.getByRole('button', { name: '存成常用', exact: true }).click();
  await page.getByRole('button', { name: '更新「租約」' }).click();
  await expect(page.getByRole('status')).toContainText('已更新「租約」');

  await page.getByRole('button', { name: '存成常用', exact: true }).click();
  await page.getByLabel('常用文件名稱').fill('租約-單方');
  await page.getByRole('button', { name: '另存' }).click();
  await page.getByRole('button', { name: '回首頁' }).click();
  await expect(page.locator('.saved-doc')).toHaveCount(2);
  // 原本那份已更新成 1 個方框
  await expect(page.locator('.saved-doc', { hasText: /^租約\s*3 頁・1 個方框$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^租約-單方/ })).toBeVisible();
});

test('常用文件：全部匯出備份 → 清空資料 → 匯入後可直接用；壞檔有錯誤訊息', async ({ page }, info) => {
  const positions = await createSavedDoc(page, '租約');
  await page.getByRole('button', { name: '管理常用文件' }).click();
  await page.getByRole('button', { name: '全部匯出備份' }).click();
  const save = page.getByRole('button', { name: '儲存備份檔' });
  await expect(save).toBeVisible();
  await page.evaluate(() => {
    (navigator as unknown as { canShare?: unknown }).canShare = undefined;
  });
  const dl = page.waitForEvent('download');
  await save.click();
  const download = await dl;
  expect(download.suggestedFilename()).toBe('快簽常用文件備份-1份.kuaiqian.json');
  const backup = info.outputPath('backup.json');
  await download.saveAs(backup);

  await freshStart(page);
  await expect(page.getByRole('heading', { name: '常用文件' })).toHaveCount(0);
  await page.getByRole('button', { name: '管理常用文件' }).click();

  const bad = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '匯入備份檔' }).click();
  await (await bad).setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('hello') });
  await expect(page.getByRole('status')).toContainText('不是快簽的備份檔');

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '匯入備份檔' }).click();
  await (await chooser).setFiles(backup);
  await expect(page.getByRole('status')).toContainText('已匯入 1 份常用文件');
  await page.getByRole('dialog', { name: '管理常用文件' }).getByRole('button', { name: '關閉' }).click();
  await page.getByRole('button', { name: /^租約/ }).click();
  await expect(page.locator('.page')).toHaveCount(3);
  expect(await fieldPositions(page)).toEqual(positions);
});

test('拍紙本：拖角校正後開成一頁文件', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /拍紙本/ }).click();
  await (await chooser).setFiles(fixture('paper.jpg'));
  await expect(page.getByText('拖動四個角對準紙張邊緣')).toBeVisible();
  const tl = (await page.getByLabel('左上角').boundingBox())!;
  await page.mouse.move(tl.x + tl.width / 2, tl.y + tl.height / 2);
  await page.mouse.down();
  await page.mouse.move(tl.x + 40, tl.y + 30, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('.page')).toHaveCount(1, { timeout: 30_000 });
  // 校正後的紙張要有內容（標題與灰色行），不能是全白
  const inked = await page.locator('.page-canvas').evaluate(async (c: HTMLCanvasElement) => {
    for (let i = 0; i < 50 && c.width === 0; i++) await new Promise((r) => setTimeout(r, 100));
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 235) n++;
    return n / (d.length / 4);
  });
  expect(inked).toBeGreaterThan(0.02);
  await page.screenshot({ path: `test-results/scan-${test.info().project.name}.png` });
});

test('自動存檔：重新整理後可繼續上次的文件', async ({ page }) => {
  await openFile(page, 'contract.pdf');
  await page.getByRole('button', { name: '＋ 新增簽名' }).click();
  await drawSignature(page);
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole('button', { name: /繼續上次的文件/ }).click();
  await expect(page.locator('.placement')).toHaveCount(1);
});

test('不支援的檔案與 .doc 有清楚錯誤訊息', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /開啟檔案/ }).click();
  await (await chooser).setFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('x') });
  await expect(page.getByRole('status')).toContainText('不支援舊版 Word');
});
