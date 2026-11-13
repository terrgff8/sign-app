import { warpPerspective, type Pt } from './homography';

export interface WarpRequest {
  src: Uint8ClampedArray;
  sw: number;
  sh: number;
  quad: Pt[];
  dw: number;
  dh: number;
}

self.onmessage = (e: MessageEvent<WarpRequest>) => {
  const { src, sw, sh, quad, dw, dh } = e.data;
  try {
    const out = warpPerspective(src, sw, sh, quad, dw, dh);
    (self as unknown as Worker).postMessage({ ok: true, out }, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
