import { PDFDocument } from '@cantoo/pdf-lib';

/** A4 寬（點）。圖片頁一律以此寬度、依比例決定高度，列印時剛好 A4 寬 */
export const IMAGE_PAGE_WIDTH = 595.28;

export interface PageImage {
  bytes: Uint8Array;
  type: 'jpeg' | 'png';
  /** 頁面尺寸（點）；省略時用 A4 寬＋圖片比例 */
  pageWidth?: number;
  pageHeight?: number;
}

export async function imagesToPdf(images: PageImage[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const img of images) {
    const embedded = img.type === 'png' ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    const width = img.pageWidth ?? IMAGE_PAGE_WIDTH;
    const height = img.pageHeight ?? (width * embedded.height) / embedded.width;
    const page = pdf.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }
  return pdf.save();
}
