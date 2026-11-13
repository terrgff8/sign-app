// 測試用：讀回 PDF，追蹤 CTM 算出每張圖片在顯示座標（0–1）的外框
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** 用 pdf.js 讀回匯出檔，求每張圖片在「顯示座標（0–1）」的外框 */
export async function imageRectsOnPage(bytes: Uint8Array, pageIndex: number) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useWorkerFetch: false, isEvalSupported: false } as never).promise;
  const page = await doc.getPage(pageIndex + 1);
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i];
    if (fn === pdfjs.OPS.save) stack.push(ctm);
    else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, args as M);
    else if (fn === pdfjs.OPS.paintImageXObject) {
      const pts = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => {
        const [ux, uy] = apply(ctm, x, y);
        const [vx, vy] = vp.convertToViewportPoint(ux, uy);
        return [vx / vp.width, vy / vp.height];
      });
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      rects.push({
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      });
    }
  });
  await doc.loadingTask.destroy();
  return rects;
}

