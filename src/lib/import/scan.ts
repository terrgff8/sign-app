import { outputSize, type Pt } from './homography';
import type { WarpRequest } from './warp.worker';

export const SCAN_MAX_EDGE = 2500;

/** 把照片中四角圍出的紙張拉正成矩形；quad 為原圖像素座標（左上、右上、右下、左下） */
export async function correctPerspective(source: HTMLCanvasElement, quad: Pt[]): Promise<HTMLCanvasElement> {
  const { width: dw, height: dh } = outputSize(quad, SCAN_MAX_EDGE);
  const sctx = source.getContext('2d')!;
  const src = sctx.getImageData(0, 0, source.width, source.height).data;

  const worker = new Worker(new URL('./warp.worker.ts', import.meta.url), { type: 'module' });
  try {
    const out = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ ok: boolean; out?: Uint8ClampedArray; message?: string }>) =>
        e.data.ok ? resolve(e.data.out!) : reject(new Error(e.data.message));
      worker.onerror = (e) => reject(new Error(e.message || '校正失敗'));
      const req: WarpRequest = { src, sw: source.width, sh: source.height, quad, dw, dh };
      worker.postMessage(req, [src.buffer]);
    });
    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(out), dw, dh), 0, 0);
    return canvas;
  } finally {
    worker.terminate();
  }
}

/** 預設四角：內縮 8% */
export function defaultQuad(w: number, h: number): Pt[] {
  const mx = w * 0.08;
  const my = h * 0.08;
  return [
    { x: mx, y: my },
    { x: w - mx, y: my },
    { x: w - mx, y: h - my },
    { x: mx, y: h - my },
  ];
}
