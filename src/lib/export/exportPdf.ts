import { LineCapStyle, PDFDocument, degrees, rgb } from '@cantoo/pdf-lib';
import { displayToUser, displaySize, imageDrawParams, normalizeRotation } from '../geometry';
import type { Placement, Stroke } from '../../types';

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 把簽名／插入的圖片壓進 PDF（純視覺簽名），回傳新檔 bytes */
export async function exportSignedPdf(
  pdfBytes: Uint8Array,
  placements: Placement[],
  strokes: Stroke[] = [],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const pages = pdf.getPages();
  const cache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  const embed = (dataUrl: string) =>
    dataUrl.startsWith('data:image/jpeg') ? pdf.embedJpg(dataUrlToBytes(dataUrl)) : pdf.embedPng(dataUrlToBytes(dataUrl));

  for (const p of placements) {
    const page = pages[p.page];
    if (!page) continue;
    let img = cache.get(p.pngDataUrl);
    if (!img) {
      img = await embed(p.pngDataUrl);
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
  for (const st of strokes) {
    const page = pages[st.page];
    if (!page || st.points.length === 0) continue;
    const rot = normalizeRotation(page.getRotation().angle);
    const box = page.getCropBox();
    const thickness = st.width * displaySize(rot, box).width;
    const color = hexToRgb(st.color);
    const pts = st.points.map(([u, v]) => displayToUser(u, v, rot, box));
    if (pts.length === 1) {
      page.drawCircle({ x: pts[0].x, y: pts[0].y, size: thickness / 2, color, borderWidth: 0 });
      continue;
    }
    for (let i = 1; i < pts.length; i++) {
      page.drawLine({ start: pts[i - 1], end: pts[i], thickness, color, lineCap: LineCapStyle.Round });
    }
  }
  pdf.setModificationDate(new Date());
  return pdf.save();
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
