import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas-pro';
import { canvasToBlob } from './image';
import { imagesToPdf, type PageImage } from './imagesToPdf';

const PX_TO_PT = 72 / 96;
/** 點陣化倍率：A4 約 1588×2246 px，手機記憶體負擔可接受 */
const RASTER_SCALE = 2;

export class DocxError extends Error {}

/**
 * Word → 在手機端排版（docx-preview）→ 逐頁點陣化（html2canvas-pro）→ 圖片頁 PDF。
 * 分頁依 Word 存檔時寫入的 lastRenderedPageBreak；單頁內容溢出時依頁高切片。
 */
export async function docxToPdf(file: Blob): Promise<Uint8Array> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // 必須在 DOM 內才量得到尺寸；移到畫面外
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:2000px;pointer-events:none;';
  const styleHost = document.createElement('div');
  document.body.append(styleHost, host);

  try {
    try {
      await renderAsync(file, host, styleHost, {
        className: 'docx',
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        ignoreWidth: false,
        ignoreHeight: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderChanges: false,
        renderComments: false,
        useBase64URL: true,
        experimental: false,
      });
    } catch {
      throw new DocxError('Word 檔讀取失敗，檔案可能毀損。可先用電腦另存成 PDF 再匯入。');
    }

    await document.fonts.ready;
    await waitImages(host);

    const sections = Array.from(host.querySelectorAll<HTMLElement>('section.docx'));
    if (sections.length === 0) throw new DocxError('Word 檔沒有可顯示的內容。');

    const pages: PageImage[] = [];
    for (const section of sections) {
      // 頁面標準高（docx-preview 寫在 min-height）；內容溢出時 section 會比它高
      const pageHeightPx = parseCssLength(section.style.minHeight) ?? section.offsetHeight;
      const widthPx = section.offsetWidth;
      const canvas = await html2canvas(section, {
        scale: RASTER_SCALE,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      for (const slice of sliceCanvas(canvas, pageHeightPx * RASTER_SCALE)) {
        const blob = await canvasToBlob(slice, 'image/jpeg', 0.88);
        pages.push({
          bytes: new Uint8Array(await blob.arrayBuffer()),
          type: 'jpeg',
          pageWidth: widthPx * PX_TO_PT,
          pageHeight: (slice.height / RASTER_SCALE) * PX_TO_PT,
        });
      }
    }
    return imagesToPdf(pages);
  } finally {
    host.remove();
    styleHost.remove();
  }
}

function parseCssLength(v: string): number | null {
  const m = /^([\d.]+)(pt|px)$/.exec(v.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'pt' ? n / PX_TO_PT : n;
}

function waitImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img')).filter((i) => !i.complete);
  return Promise.all(
    imgs.map(
      (i) =>
        new Promise<void>((resolve) => {
          i.addEventListener('load', () => resolve(), { once: true });
          i.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  );
}

/** 高度超過一頁 5% 以上才切成整頁高的片，最後一片不足處補白 */
function sliceCanvas(canvas: HTMLCanvasElement, pageHeight: number): HTMLCanvasElement[] {
  if (canvas.height <= pageHeight * 1.05) return [canvas];
  const out: HTMLCanvasElement[] = [];
  for (let y = 0; y < canvas.height; y += pageHeight) {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = Math.round(pageHeight);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(canvas, 0, -y);
    out.push(c);
  }
  return out;
}
