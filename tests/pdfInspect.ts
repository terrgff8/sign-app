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


/** 用 pdf.js 讀回匯出檔，取每條折線在「顯示座標（0–1）」的頂點、線寬（點）與顏色 */
export async function strokesOnPage(bytes: Uint8Array, pageIndex: number) {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useWorkerFetch: false, isEvalSupported: false } as never).promise;
  const page = await doc.getPage(pageIndex + 1);
  const vp = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  let color = '';
  let width = 0;
  const out: { color: string; width: number; points: [number, number][] }[] = [];
  const toDisplay = (x: number, y: number): [number, number] => {
    const [ux, uy] = apply(ctm, x, y);
    const [vx, vy] = vp.convertToViewportPoint(ux, uy);
    return [vx / vp.width, vy / vp.height];
  };
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i];
    if (fn === pdfjs.OPS.save) stack.push(ctm);
    else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, args as M);
    else if (fn === pdfjs.OPS.setStrokeRGBColor) color = args[0] as string;
    else if (fn === pdfjs.OPS.setLineWidth) width = args[0] as number;
    else if (fn === pdfjs.OPS.constructPath) {
      // pdf.js 6.x：args = [paintOp, [path 資料], minMax]；path 資料 0=moveTo、1=lineTo，各帶 x y
      const d = Array.from(args[1][0] as ArrayLike<number>);
      const points: [number, number][] = [];
      for (let k = 0; k < d.length; ) {
        if (d[k] === 0 || d[k] === 1) {
          const p = toDisplay(d[k + 1], d[k + 2]);
          const last = points[points.length - 1];
          if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
          k += 3;
        } else break;
      }
      if (!points.length) return;
      // 一條筆跡被拆成多段線（每段一個 path）：頭尾相接、同色同寬就併回同一條
      const prev = out[out.length - 1];
      const tail = prev?.points[prev.points.length - 1];
      if (prev && tail && prev.color === color && prev.width === width && Math.hypot(tail[0] - points[0][0], tail[1] - points[0][1]) < 1e-9) {
        prev.points.push(...points.slice(1));
      } else out.push({ color, width, points });
    }
  });
  await doc.loadingTask.destroy();
  return out;
}
