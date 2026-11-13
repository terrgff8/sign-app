import { PDFDocument } from '@cantoo/pdf-lib';
import { canvasToBlob, decodeImage } from './image';
import { imagesToPdf } from './imagesToPdf';

export class ImportError extends Error {}

export interface ImportedDoc {
  name: string;
  pdfBytes: Uint8Array;
}

type Kind = 'pdf' | 'image' | 'docx' | 'doc' | 'unknown';

export function detectKind(file: File): Kind {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/.test(name)) return 'image';
  if (name.endsWith('.docx') || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (name.endsWith('.doc') || type === 'application/msword') return 'doc';
  return 'unknown';
}

export function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || '文件';
}

/** 確認 pdf-lib 能寫入（加密的 PDF 無法加簽名） */
async function assertWritable(bytes: Uint8Array) {
  try {
    await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (e instanceof Error && /encrypt/i.test(e.message)) {
      throw new ImportError('這份 PDF 有加密保護，無法加上簽名。請先用電腦另存一份未加密的 PDF。');
    }
    throw new ImportError('這份 PDF 檔案毀損或格式不支援。');
  }
}

export async function importFile(file: File): Promise<ImportedDoc> {
  const name = baseName(file.name);
  switch (detectKind(file)) {
    case 'pdf': {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await assertWritable(bytes);
      return { name, pdfBytes: bytes };
    }
    case 'image':
      return { name, pdfBytes: await imageFileToPdf(file) };
    case 'docx': {
      const { docxToPdf } = await import('./docx');
      return { name, pdfBytes: await docxToPdf(file) };
    }
    case 'doc':
      throw new ImportError('不支援舊版 Word（.doc），請另存成 .docx 或 PDF 後再匯入。');
    default:
      throw new ImportError('不支援這種檔案，請選擇 PDF、Word（.docx）或圖片。');
  }
}

export async function imageFileToPdf(blob: Blob): Promise<Uint8Array> {
  const canvas = await decodeImage(blob);
  const isPng = blob.type === 'image/png';
  const out = await canvasToBlob(canvas, isPng ? 'image/png' : 'image/jpeg', 0.9);
  return imagesToPdf([{ bytes: new Uint8Array(await out.arrayBuffer()), type: isPng ? 'png' : 'jpeg' }]);
}
