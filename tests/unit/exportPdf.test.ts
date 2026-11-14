import { PDFDocument, concatTransformationMatrix, degrees } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { imageRectsOnPage, strokesOnPage } from '../pdfInspect';
import { exportSignedPdf } from '../../src/lib/export/exportPdf';
import type { Placement } from '../../src/types';

// 1×1 不透明紅點 PNG
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

async function makePdf(opts: { rotate?: number; crop?: [number, number, number, number]; size?: [number, number] }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage(opts.size ?? [595, 842]);
  if (opts.rotate) page.setRotation(degrees(opts.rotate));
  if (opts.crop) page.setCropBox(...opts.crop);
  // 原本內容故意改了 CTM 又不還原，確認簽名不受影響
  page.pushOperators(concatTransformationMatrix(2, 0, 0, 2, 10, 10));
  return pdf.save();
}

const placement = (rect: Partial<Placement>): Placement => ({
  id: 'p',
  page: 0,
  x: 0.1,
  y: 0.2,
  w: 0.3,
  h: 0.1,
  pngDataUrl: PNG,
  aspect: 3,
  ...rect,
});

describe('exportSignedPdf：簽名位置與畫面一致', () => {
  const cases: [string, Parameters<typeof makePdf>[0]][] = [
    ['一般直式', {}],
    ['旋轉 90°', { rotate: 90 }],
    ['旋轉 180°', { rotate: 180 }],
    ['旋轉 270°', { rotate: 270 }],
    ['有 CropBox 偏移', { crop: [40, 60, 400, 500] }],
    ['旋轉 90°＋CropBox', { rotate: 90, crop: [30, 50, 500, 600] }],
    ['橫式頁面', { size: [842, 595] }],
  ];

  for (const [name, opts] of cases) {
    it(name, async () => {
      const src = await makePdf(opts);
      const p = placement({ x: 0.12, y: 0.63, w: 0.31, h: 0.09 });
      const out = await exportSignedPdf(src, [p]);
      const [r] = await imageRectsOnPage(out, 0);
      expect(r).toBeDefined();
      expect(r.x).toBeCloseTo(p.x, 4);
      expect(r.y).toBeCloseTo(p.y, 4);
      expect(r.w).toBeCloseTo(p.w, 4);
      expect(r.h).toBeCloseTo(p.h, 4);
    });
  }

  it('多頁、多個簽名各自落在正確頁面', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    pdf.addPage([595, 842]).setRotation(degrees(90));
    const src = await pdf.save();
    const a = placement({ id: 'a', page: 0, x: 0.5, y: 0.5, w: 0.2, h: 0.05 });
    const b = placement({ id: 'b', page: 1, x: 0.05, y: 0.8, w: 0.25, h: 0.12 });
    const out = await exportSignedPdf(src, [a, b]);
    const [ra] = await imageRectsOnPage(out, 0);
    const [rb] = await imageRectsOnPage(out, 1);
    expect(ra.x).toBeCloseTo(a.x, 4);
    expect(rb.y).toBeCloseTo(b.y, 4);
    expect(rb.w).toBeCloseTo(b.w, 4);
  });
});

describe('exportSignedPdf：畫筆筆跡位置、顏色、粗細與畫面一致', () => {
  const cases: [string, Parameters<typeof makePdf>[0]][] = [
    ['一般直式', {}],
    ['旋轉 90°', { rotate: 90 }],
    ['旋轉 180°', { rotate: 180 }],
    ['旋轉 270°', { rotate: 270 }],
    ['有 CropBox 偏移', { crop: [40, 60, 400, 500] }],
    ['旋轉 90°＋CropBox', { rotate: 90, crop: [30, 50, 500, 600] }],
    ['橫式頁面', { size: [842, 595] }],
  ];
  const pts: [number, number][] = [
    [0.12, 0.2],
    [0.4, 0.35],
    [0.7, 0.18],
  ];

  for (const [name, opts] of cases) {
    it(name, async () => {
      const src = await makePdf(opts);
      const out = await exportSignedPdf(src, [], [{ id: 's', page: 0, color: '#d92d20', width: 0.005, points: pts }]);
      const [s] = await strokesOnPage(out, 0);
      expect(s.color).toBe('#d92d20');
      expect(s.points).toHaveLength(pts.length);
      pts.forEach(([u, v], i) => {
        expect(s.points[i][0]).toBeCloseTo(u, 4);
        expect(s.points[i][1]).toBeCloseTo(v, 4);
      });
      // 筆寬＝顯示頁寬×比例（旋轉頁用旋轉後的寬）
      const pdf = await PDFDocument.load(out);
      const page = pdf.getPage(0);
      const box = page.getCropBox();
      const rot = page.getRotation().angle;
      const dispW = rot === 90 || rot === 270 ? box.height : box.width;
      expect(s.width).toBeCloseTo(0.005 * dispW, 3);
    });
  }

  it('多頁、多筆、不同顏色各自落在正確頁面；沒有 strokes 時不多畫東西', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    pdf.addPage([595, 842]);
    const src = await pdf.save();
    const out = await exportSignedPdf(
      src,
      [],
      [
        { id: 'a', page: 1, color: '#1d4ed8', width: 0.01, points: [[0.1, 0.1], [0.2, 0.2]] },
        { id: 'b', page: 1, color: '#15803d', width: 0.0025, points: [[0.5, 0.5], [0.6, 0.7]] },
      ],
    );
    expect(await strokesOnPage(out, 0)).toHaveLength(0);
    const p2 = await strokesOnPage(out, 1);
    expect(p2.map((s) => s.color)).toEqual(['#1d4ed8', '#15803d']);
    expect(await strokesOnPage(await exportSignedPdf(src, [], []), 1)).toHaveLength(0);
  });

  it('只點一下（單點）也會留下一個點', async () => {
    const src = await makePdf({});
    const out = await exportSignedPdf(src, [], [{ id: 'd', page: 0, color: '#111114', width: 0.01, points: [[0.5, 0.5]] }]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).node.Contents()).toBeDefined();
    const [s] = await strokesOnPage(out, 0);
    expect(s).toBeDefined();
  });
});
