import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from '../lib/pdfjs';

/** iOS Safari 單一 canvas 上限約 16.7M 像素，總記憶體也有限，保守取 8M */
const MAX_CANVAS_AREA = 8_000_000;

interface Props {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  cssWidth: number;
  cssHeight: number;
  /** 在可視範圍附近才渲染，離開後釋放記憶體 */
  active: boolean;
}

export function PageCanvas({ pdf, pageIndex, cssWidth, cssHeight, active }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!active) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let cancelled = false;
    let task: { cancel(): void } | null = null;
    // 縮放過程中不要每一幀重繪，等穩定 150ms
    const timer = setTimeout(async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let scale = (cssWidth / base.width) * dpr;
      const area = base.width * base.height * scale * scale;
      if (area > MAX_CANVAS_AREA) scale *= Math.sqrt(MAX_CANVAS_AREA / area);
      const viewport = page.getViewport({ scale });
      // 先畫到離屏 canvas，完成後再搬，避免重繪時閃白
      const off = document.createElement('canvas');
      off.width = Math.floor(viewport.width);
      off.height = Math.floor(viewport.height);
      const renderTask = page.render({ canvas: off, viewport });
      task = renderTask;
      try {
        await renderTask.promise;
      } catch {
        return;
      }
      if (cancelled) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext('2d')!.drawImage(off, 0, 0);
      off.width = 0;
      off.height = 0;
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, pageIndex, cssWidth, active]);

  return <canvas ref={ref} className="page-canvas" style={{ width: cssWidth, height: cssHeight }} />;
}
