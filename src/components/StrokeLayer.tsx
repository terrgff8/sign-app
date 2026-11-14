import { useRef, useState } from 'react';
import { useApp } from '../state/store';
import type { Stroke } from '../types';

interface Props {
  page: number;
  pageW: number;
  pageH: number;
}

type Pt = [number, number];

const pathOf = (pts: Pt[], w: number, h: number) => {
  const [first, ...rest] = pts;
  if (!first) return '';
  const m = `M${first[0] * w} ${first[1] * h}`;
  // 單點也要有可見的點：零長度線段＋圓頭
  return rest.length ? m + rest.map((p) => `L${p[0] * w} ${p[1] * h}`).join('') : `${m}l0 0`;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function StrokeLayer({ page, pageW, pageH }: Props) {
  const strokes = useApp((s) => s.work.strokes);
  const drawing = useApp((s) => s.mode === 'draw');
  const pen = useApp((s) => s.pen);
  const addStroke = useApp((s) => s.addStroke);
  const mine = (strokes ?? []).filter((s) => s.page === page);

  const surface = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [live, setLive] = useState<Pt[] | null>(null);
  const liveRef = useRef<Pt[] | null>(null);

  const setLivePts = (v: Pt[] | null) => {
    liveRef.current = v;
    setLive(v);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size > 1) {
      // 第二根手指＝要縮放／捲動，丟掉剛起筆的那一點
      setLivePts(null);
      return;
    }
    const r = surface.current!.getBoundingClientRect();
    surface.current!.setPointerCapture(e.pointerId);
    setLivePts([[clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)]]);
  };

  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size > 1) {
      // 雙指：依單指位移的一半（≈兩指中心位移）捲動；縮放交給 DocumentViewer 的 pinch
      const viewer = surface.current?.closest('.viewer');
      if (viewer) {
        viewer.scrollLeft -= (next.x - prev.x) / 2;
        viewer.scrollTop -= (next.y - prev.y) / 2;
      }
      return;
    }
    const cur = liveRef.current;
    if (!cur) return;
    const r = surface.current!.getBoundingClientRect();
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const pts = cur.slice();
    for (const ce of events.length ? events : [e.nativeEvent]) {
      const q: Pt = [clamp01((ce.clientX - r.left) / r.width), clamp01((ce.clientY - r.top) / r.height)];
      const last = pts[pts.length - 1];
      // 小於 1px 的抖動不記，避免高頻觸控筆把資料撐大
      if (Math.hypot((q[0] - last[0]) * r.width, (q[1] - last[1]) * r.height) >= 1) pts.push(q);
    }
    setLivePts(pts);
  };

  const onUp = (e: React.PointerEvent) => {
    const wasMulti = pointers.current.size > 1;
    pointers.current.delete(e.pointerId);
    const pts = liveRef.current;
    setLivePts(null);
    if (wasMulti || !pts || e.type === 'pointercancel') return;
    addStroke({ page, color: pen.color, width: pen.width, points: pts });
  };

  const render = (s: Pick<Stroke, 'color' | 'width' | 'points'>, key?: string) => (
    <path
      key={key}
      d={pathOf(s.points, pageW, pageH)}
      fill="none"
      stroke={s.color}
      strokeWidth={s.width * pageW}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  return (
    <>
      {(mine.length > 0 || live) && (
        <svg className="stroke-layer" viewBox={`0 0 ${pageW} ${pageH}`} aria-hidden="true">
          {mine.map((s) => render(s, s.id))}
          {live && render({ ...pen, points: live })}
        </svg>
      )}
      {drawing && (
        <svg
          ref={surface}
          className="stroke-surface"
          data-testid="stroke-surface"
          viewBox={`0 0 ${pageW} ${pageH}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}
    </>
  );
}
