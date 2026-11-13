import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { clamp } from '../lib/geometry';
import type { RelRect } from '../types';

type Rect = Omit<RelRect, 'page'>;
type Corner = 'tl' | 'tr' | 'br' | 'bl';

interface Props {
  rect: Rect;
  pageW: number;
  pageH: number;
  /** none：不能互動；tap：只能點；edit：點選後可拖移與四角縮放 */
  interaction: 'none' | 'tap' | 'edit';
  selected: boolean;
  /** 鎖定比例（頁面點座標下 w/h），簽名用 */
  aspect?: number;
  className?: string;
  label?: string;
  style?: CSSProperties;
  onTap?(): void;
  onDragStart?(): void;
  onChange?(rect: Rect): void;
  children?: ReactNode;
}

const TAP_SLOP = 8;
const MIN_PX = 18;

interface DragState {
  pointerId: number;
  kind: 'move' | Corner;
  startX: number;
  startY: number;
  start: Rect;
  moved: boolean;
}

export function OverlayItem({
  rect,
  pageW,
  pageH,
  interaction,
  selected,
  aspect,
  className,
  label,
  style,
  onTap,
  onDragStart,
  onChange,
  children,
}: Props) {
  const drag = useRef<DragState | null>(null);
  const editable = interaction === 'edit' && selected;

  const begin = (e: PointerEvent, kind: DragState['kind']) => {
    if (interaction === 'none' || drag.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    if (editable) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, kind, startX: e.clientX, startY: e.clientY, start: rect, moved: false };
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dxPx, dyPx) < TAP_SLOP) return;
      if (!editable) {
        // 未選取時拖動＝捲動頁面，放掉
        drag.current = null;
        return;
      }
      d.moved = true;
      onDragStart?.();
    }
    e.preventDefault();
    onChange?.(computeRect(d, dxPx / pageW, dyPx / pageH, pageW, pageH, aspect));
  };

  const end = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) onTap?.();
  };

  const cancel = () => {
    drag.current = null;
  };

  const box: CSSProperties = {
    ...style,
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
    touchAction: editable ? 'none' : interaction === 'none' ? 'auto' : 'manipulation',
    pointerEvents: interaction === 'none' ? 'none' : 'auto',
  };

  return (
    <div
      className={`overlay-item ${className ?? ''} ${selected ? 'is-selected' : ''}`}
      style={box}
      role={interaction === 'none' ? undefined : 'button'}
      aria-label={label}
      aria-pressed={interaction === 'edit' ? selected : undefined}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
    >
      {children}
      {editable &&
        (['tl', 'tr', 'br', 'bl'] as Corner[]).map((c) => (
          // move／up 事件會冒泡到外層 div 處理
          <span key={c} className={`handle handle-${c}`} onPointerDown={(e) => begin(e, c)} />
        ))}
    </div>
  );
}

function computeRect(d: DragState, dx: number, dy: number, pageW: number, pageH: number, aspect?: number): Rect {
  const s = d.start;
  if (d.kind === 'move') {
    // 至少留 10% 在頁內，避免拖丟
    return {
      ...s,
      x: clamp(s.x + dx, -s.w * 0.9, 1 - s.w * 0.1),
      y: clamp(s.y + dy, -s.h * 0.9, 1 - s.h * 0.1),
    };
  }
  const left = d.kind === 'tl' || d.kind === 'bl';
  const top = d.kind === 'tl' || d.kind === 'tr';
  const minW = MIN_PX / pageW;
  const minH = MIN_PX / pageH;
  let w = Math.max(minW, s.w + (left ? -dx : dx));
  let h = Math.max(minH, s.h + (top ? -dy : dy));
  if (aspect) {
    // 兩軸縮放倍率取平均，維持比例
    const k = Math.max(minW / s.w, minH / s.h, (w / s.w + h / s.h) / 2);
    w = s.w * k;
    h = (w * pageW) / aspect / pageH;
  }
  return {
    x: left ? s.x + s.w - w : s.x,
    y: top ? s.y + s.h - h : s.y,
    w,
    h,
  };
}
