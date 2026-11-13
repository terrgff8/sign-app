import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { imageDrawParams, normalizeRotation } from '../geometry';
import type { Placement } from '../../types';

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 把簽名 PNG 壓進 PDF（純視覺簽名），回傳新檔 bytes */
export async function exportSignedPdf(pdfBytes: Uint8Array, placements: Placement[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const pages = pdf.getPages();
  const cache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

  for (const p of placements) {
    const page = pages[p.page];
    if (!page) continue;
    let img = cache.get(p.pngDataUrl);
    if (!img) {
      img = await pdf.embedPng(dataUrlToBytes(p.pngDataUrl));
      cache.set(p.pngDataUrl, img);
    }
    const rot = normalizeRotation(page.getRotation().angle);
    const params = imageDrawParams(p, rot, page.getCropBox());
    page.drawImage(img, {
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      rotate: degrees(params.rotateDegrees),
    });
  }
  pdf.setModificationDate(new Date());
  return pdf.save();
}
