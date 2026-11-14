import { PDFDocument } from '@cantoo/pdf-lib';
import type { WorkState } from '../types';
import { IMAGE_PAGE_WIDTH, type PageImage } from './import/imagesToPdf';

/** 把圖片各做成一頁（A4 寬、依比例定高），插在第 at 頁（0 起算）之前 */
export async function insertImagePages(pdfBytes: Uint8Array, at: number, images: PageImage[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  let index = at;
  for (const img of images) {
    const embedded = img.type === 'png' ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    const width = IMAGE_PAGE_WIDTH;
    const height = (width * embedded.height) / embedded.width;
    const page = pdf.insertPage(index++, [width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }
  return pdf.save();
}

export async function removePage(pdfBytes: Uint8Array, index: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  pdf.removePage(index);
  return pdf.save();
}

/**
 * 頁碼位移：delta > 0 表示在 at 插入 delta 頁；delta < 0 表示從 at 刪掉 -delta 頁（該範圍上的方框、簽名丟棄）。
 */
export function shiftWork(work: WorkState, at: number, delta: number): WorkState {
  const removed = (p: number) => delta < 0 && p >= at && p < at - delta;
  const move = (p: number) => (p >= at ? p + delta : p);
  const fields = work.fields.filter((f) => !removed(f.page)).map((f) => ({ ...f, page: move(f.page) }));
  const fieldIds = new Set(fields.map((f) => f.id));
  const placements = work.placements
    .filter((p) => !removed(p.page) && (!p.fieldId || fieldIds.has(p.fieldId)))
    .map((p) => ({ ...p, page: move(p.page) }));
  const strokes = (work.strokes ?? []).filter((s) => !removed(s.page)).map((s) => ({ ...s, page: move(s.page) }));
  return { signers: work.signers, fields, placements, strokes };
}

/** 使用者插入頁的頁碼清單跟著位移 */
export function shiftPageList(pages: number[], at: number, delta: number): number[] {
  return pages
    .filter((p) => !(delta < 0 && p >= at && p < at - delta))
    .map((p) => (p >= at ? p + delta : p));
}
