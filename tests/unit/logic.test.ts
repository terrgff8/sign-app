import { describe, expect, it } from 'vitest';
import { fitIntoBox, normalizeRotation } from '../../src/lib/geometry';
import { homography, outputSize, project, warpPerspective } from '../../src/lib/import/homography';
import { base64ToBytes, BackupFormatError, bytesToBase64, makeSavedDoc, parseBackup, serializeBackup, toWorkState } from '../../src/lib/savedDocs';
import type { Field, Signer } from '../../src/types';

describe('geometry', () => {
  it('normalizeRotation', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(0)).toBe(0);
  });

  it('寬簽名放進高方框：寬度貼齊、垂直置中、比例不變', () => {
    const page = { width: 600, height: 800 };
    const field = { page: 2, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }; // 120×160 點
    const r = fitIntoBox(field, 4, page, 0);
    expect(r.page).toBe(2);
    expect(r.w * page.width).toBeCloseTo(120);
    expect(r.h * page.height).toBeCloseTo(30);
    expect(r.x).toBeCloseTo(0.1);
    expect(r.y + r.h / 2).toBeCloseTo(0.2); // 中心
  });

  it('高簽名放進扁方框：高度貼齊、留內距', () => {
    const page = { width: 600, height: 800 };
    const field = { page: 0, x: 0.5, y: 0.5, w: 0.5, h: 0.05 }; // 300×40
    const r = fitIntoBox(field, 1, page, 0.1);
    expect(r.h * page.height).toBeCloseTo(36);
    expect(r.w * page.width).toBeCloseTo(36);
    expect(r.x + r.w / 2).toBeCloseTo(0.75);
  });
});

describe('homography', () => {
  it('四點對應精準', () => {
    const src = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const dst = [
      { x: 12, y: 30 },
      { x: 180, y: 8 },
      { x: 200, y: 140 },
      { x: 5, y: 120 },
    ];
    const h = homography(src, dst);
    src.forEach((p, i) => {
      const q = project(h, p);
      expect(q.x).toBeCloseTo(dst[i].x, 6);
      expect(q.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it('共線的四角會丟錯', () => {
    const line = [0, 1, 2, 3].map((i) => ({ x: i, y: i }));
    expect(() => homography(line, line)).toThrow();
  });

  it('outputSize 依邊長並限制長邊', () => {
    const quad = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 0, y: 2000 },
    ];
    expect(outputSize(quad, 2500)).toEqual({ width: 2500, height: 1250 });
  });

  it('warpPerspective：取原圖中的子矩形＝裁切', () => {
    // 4×4 原圖，每格灰階值＝x*10+y
    const sw = 4;
    const sh = 4;
    const src = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const o = (y * sw + x) * 4;
        src[o] = src[o + 1] = src[o + 2] = x * 10 + y;
        src[o + 3] = 255;
      }
    const quad = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ];
    const out = warpPerspective(src, sw, sh, quad, 2, 2);
    expect([out[0], out[4], out[8], out[12]]).toEqual([11, 21, 12, 22]);
  });
});

describe('常用文件', () => {
  const signers: Signer[] = [
    { id: 's1', name: '甲方' },
    { id: 's2', name: '乙方' },
  ];
  const fields: Field[] = [
    { id: 'f1', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.08, signerId: 's1' },
    { id: 'f2', page: 2, x: 0.6, y: 0.8, w: 0.3, h: 0.08, signerId: 's2' },
  ];
  const sizes = [0, 1, 2].map(() => ({ width: 595, height: 842 }));
  const pdf = new Uint8Array(70_000).map((_, i) => (i * 37) % 256); // 測大檔分段 base64

  it('base64 往返（大於分段大小）', () => {
    expect(base64ToBytes(bytesToBase64(pdf))).toEqual(pdf);
  });

  it('開常用文件：乾淨副本、新 id、沒有簽名', () => {
    const doc = makeSavedDoc('租約', sizes, signers, fields);
    const a = toWorkState(doc);
    const b = toWorkState(doc);
    expect(a.placements).toEqual([]);
    expect(a.fields).toHaveLength(2);
    expect(a.fields[0].id).not.toBe(b.fields[0].id);
    expect(a.fields.map(({ id: _id, ...f }) => f)).toEqual(fields.map(({ id: _id, ...f }) => f));
  });

  it('更新保留 id 與建立時間', () => {
    const doc = makeSavedDoc('租約', sizes, signers, fields);
    const updated = makeSavedDoc('ignored', sizes, signers, fields.slice(0, 1), { ...doc, createdAt: 1 });
    expect(updated.id).toBe(doc.id);
    expect(updated.createdAt).toBe(1);
    expect(updated.fields).toHaveLength(1);
  });

  it('備份往返資料一致（含 PDF bytes）', () => {
    const doc = makeSavedDoc('租約', sizes, signers, fields);
    const [back] = parseBackup(serializeBackup([{ doc, pdfBytes: pdf }]));
    expect(back.name).toBe('租約');
    expect(back.pdfBytes).toEqual(pdf);
    expect(back.signers).toEqual(signers);
    expect(back.fields).toEqual(fields.map(({ id: _id, ...f }) => f));
  });

  it.each([
    ['不是 JSON', 'hello'],
    ['別的 JSON', '{"a":1}'],
    ['版本太新', JSON.stringify({ kind: 'kuaiqian-saved-docs', schemaVersion: 99, docs: [] })],
    ['沒有文件', JSON.stringify({ kind: 'kuaiqian-saved-docs', schemaVersion: 1, docs: [] })],
    ['缺 PDF', JSON.stringify({ kind: 'kuaiqian-saved-docs', schemaVersion: 1, docs: [{ name: 'x', pdfBase64: '', signers: [], fields: [] }] })],
    [
      '方框指到不存在的簽署人',
      JSON.stringify({
        kind: 'kuaiqian-saved-docs',
        schemaVersion: 1,
        docs: [{ name: 'x', pdfBase64: 'AAAA', signers: [], fields: [{ page: 0, x: 0, y: 0, w: 0.1, h: 0.1, signerId: 'nope' }] }],
      }),
    ],
  ])('壞檔：%s', (_name, text) => {
    expect(() => parseBackup(text)).toThrow(BackupFormatError);
  });
});
