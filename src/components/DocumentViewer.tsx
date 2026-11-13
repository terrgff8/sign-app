import { usePinch } from '@use-gesture/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { PageCanvas } from './PageCanvas';
import { PageOverlay } from './PageOverlay';

const GAP = 16;
const MAX_BASE_WIDTH = 920;

export function DocumentViewer() {
  const pdf = useApp((s) => s.pdf)!;
  const meta = useApp((s) => s.meta)!;
  const zoom = useApp((s) => s.zoom);
  const setZoom = useApp((s) => s.setZoom);
  const select = useApp((s) => s.select);
  const setVisiblePage = useApp((s) => s.setVisiblePage);
  const scrollTarget = useApp((s) => s.scrollTarget);

  const scroller = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [viewW, setViewW] = useState(0);
  const [active, setActive] = useState<Set<number>>(() => new Set([0]));
  const focal = useRef<{ ox: number; oy: number; cx: number; cy: number; z0: number } | null>(null);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const baseW = Math.max(200, Math.min(viewW - GAP * 2, MAX_BASE_WIDTH));
  const pageW = baseW * zoom;

  // 可視範圍上下各一個螢幕高的頁面才渲染
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        setActive((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next;
        });
      },
      { root: scroller.current, rootMargin: '100% 0px 100% 0px' },
    );
    pageRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [meta.pageSizes.length]);

  // 目前頁＝畫面中線所在的頁
  useEffect(() => {
    const el = scroller.current!;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // 捲到底時最後一頁若較矮（例如橫式頁）到不了中線，直接算它
        if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          setVisiblePage(pageRefs.current.length - 1);
          return;
        }
        const mid = el.getBoundingClientRect().top + el.clientHeight / 2;
        let best = 0;
        let bestDist = Infinity;
        pageRefs.current.forEach((p, i) => {
          if (!p) return;
          const r = p.getBoundingClientRect();
          const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0;
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        setVisiblePage(best);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [setVisiblePage, pageW]);

  // 雙指縮放：記住手指中心對應的內容座標，縮放後捲回同一點
  usePinch(
    ({ first, last, origin: [ox, oy], offset: [s] }) => {
      const el = scroller.current!;
      const r = el.getBoundingClientRect();
      if (first) {
        const z0 = useApp.getState().zoom;
        focal.current = {
          ox: ox - r.left,
          oy: oy - r.top,
          cx: (el.scrollLeft + ox - r.left) / z0,
          cy: (el.scrollTop + oy - r.top) / z0,
          z0,
        };
      }
      setZoom(s);
      if (last) requestAnimationFrame(() => (focal.current = null));
    },
    {
      target: scroller,
      scaleBounds: { min: 1, max: 4 },
      from: () => [useApp.getState().zoom, 0],
      eventOptions: { passive: false },
    },
  );

  useLayoutEffect(() => {
    const f = focal.current;
    const el = scroller.current;
    if (!f || !el) return;
    el.scrollLeft = f.cx * zoom - f.ox;
    el.scrollTop = f.cy * zoom - f.oy;
  }, [zoom]);

  useEffect(() => {
    if (!scrollTarget) return;
    const el = scroller.current;
    const page = pageRefs.current[scrollTarget.page];
    if (!el || !page) return;
    const size = meta.pageSizes[scrollTarget.page];
    const pageH = (pageW * size.height) / size.width;
    const top = page.offsetTop + scrollTarget.y * pageH - el.clientHeight * 0.35;
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [scrollTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={scroller}
      className="viewer"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('page-canvas')) select(null);
      }}
    >
      <div className="viewer-inner" style={{ width: pageW + GAP * 2 }}>
        {meta.pageSizes.map((size, i) => {
          const pageH = (pageW * size.height) / size.width;
          return (
            <div
              key={i}
              ref={(el) => {
                pageRefs.current[i] = el;
              }}
              data-page={i}
              className="page"
              style={{ width: pageW, height: pageH }}
            >
              <PageCanvas pdf={pdf} pageIndex={i} cssWidth={pageW} cssHeight={pageH} active={active.has(i)} />
              <PageOverlay page={i} pageW={pageW} pageH={pageH} />
              <span className="page-number">
                {i + 1} / {meta.pageSizes.length}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
