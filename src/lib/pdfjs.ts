// legacy build：支援較舊的 iOS Safari
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageSize } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const base = import.meta.env.BASE_URL;

export class PdfPasswordError extends Error {}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js 會把 buffer 轉移給 worker（原陣列被清空），一律傳副本
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    iccUrl: `${base}pdfjs/iccs/`,
    enableXfa: false,
  });
  let needsPassword = false;
  task.onPassword = () => {
    needsPassword = true;
    void task.destroy();
  };
  try {
    return await task.promise;
  } catch (e) {
    if (needsPassword || (e instanceof Error && e.name === 'PasswordException')) {
      throw new PdfPasswordError('這份 PDF 有密碼保護，請先用電腦解除密碼再匯入');
    }
    throw e;
  }
}

export async function readPageSizes(doc: PDFDocumentProxy): Promise<PageSize[]> {
  const sizes: PageSize[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    sizes.push({ width: vp.width, height: vp.height });
  }
  return sizes;
}

export type { PDFDocumentProxy };
