import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { canvasToBlob, decodeImage } from '../lib/import/image';
import { imagesToPdf } from '../lib/import/imagesToPdf';
import { correctPerspective, defaultQuad } from '../lib/import/scan';
import type { Pt } from '../lib/import/homography';
import { errorText } from './ui';

interface Props {
  file: File;
  onCancel(): void;
  onDone(pdfBytes: Uint8Array): void;
}

const LABELS = ['左上', '右上', '右下', '左下'];

/** 拍照後拖四個角對準紙張邊緣，透視校正成正面平整的頁面 */
export function ScanCropper({ file, onCancel, onDone }: Props) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [quad, setQuad] = useState<Pt[]>([]);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const imgHost = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0, scale: 1 });
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    decodeImage(file)
      .then((c) => {
        if (!alive) return;
        setSource(c);
        setQuad(defaultQuad(c.width, c.height));
      })
      .catch((e) => setError(errorText(e, '無法讀取照片')));
    return () => {
      alive = false;
    };
  }, [file]);

  // 圖片等比放進可用區域
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || !source) return;
    const fit = () => {
      const pad = 24;
      const scale = Math.min((el.clientWidth - pad * 2) / source.width, (el.clientHeight - pad * 2) / source.height);
      setView({ w: source.width * scale, h: source.height * scale, scale });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [source]);

  useLayoutEffect(() => {
    const host = imgHost.current;
    if (!host || !source) return;
    source.className = 'scan-img';
    host.replaceChildren(source);
  }, [source]);

  const onDown = (i: number) => (e: PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragging.current = i;
  };
  const onMove = (e: PointerEvent) => {
    const i = dragging.current;
    if (i === null || !source || !imgHost.current) return;
    const r = imgHost.current.getBoundingClientRect();
    const x = Math.min(source.width, Math.max(0, (e.clientX - r.left) / view.scale));
    const y = Math.min(source.height, Math.max(0, (e.clientY - r.top) / view.scale));
    setQuad((q) => q.map((p, j) => (j === i ? { x, y } : p)));
  };
  const onUp = () => {
    dragging.current = null;
  };

  const finish = async (correct: boolean) => {
    if (!source) return;
    setWorking(true);
    try {
      const out = correct ? await correctPerspective(source, quad) : source;
      const blob = await canvasToBlob(out, 'image/jpeg', 0.9);
      onDone(await imagesToPdf([{ bytes: new Uint8Array(await blob.arrayBuffer()), type: 'jpeg' }]));
    } catch (e) {
      setError(errorText(e, '校正失敗，請重新拖曳四個角'));
      setWorking(false);
    }
  };

  const pts = quad.map((p) => `${p.x * view.scale},${p.y * view.scale}`).join(' ');

  return (
    <div className="scan" role="dialog" aria-modal="true" aria-label="調整紙張範圍">
      <header className="pad-head">
        <button className="btn ghost" onClick={onCancel} disabled={working}>
          取消
        </button>
        <div className="pad-title">拖動四個角對準紙張邊緣</div>
        <button className="btn primary" onClick={() => finish(true)} disabled={!source || working}>
          {working ? '處理中…' : '完成'}
        </button>
      </header>
      <div className="scan-stage" ref={stage} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {error && <p className="warn">{error}</p>}
        {source && (
          <div className="scan-frame" style={{ width: view.w, height: view.h }}>
            <div ref={imgHost} className="scan-img-host" />
            <svg className="scan-svg" width={view.w} height={view.h} aria-hidden="true">
              <polygon points={pts} />
            </svg>
            {quad.map((p, i) => (
              <button
                key={i}
                className="scan-handle"
                aria-label={`${LABELS[i]}角`}
                style={{ left: p.x * view.scale, top: p.y * view.scale }}
                onPointerDown={onDown(i)}
              />
            ))}
          </div>
        )}
      </div>
      <footer className="pad-foot">
        <button className="btn ghost" onClick={() => finish(false)} disabled={!source || working}>
          不校正，用原圖
        </button>
      </footer>
    </div>
  );
}
