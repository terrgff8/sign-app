import type { PageSize, RelRect } from '../types';

export type Rotation = 0 | 90 | 180 | 270;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeRotation(angle: number): Rotation {
  const r = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}

/**
 * 顯示座標（0–1，左上原點，套用 /Rotate 後）→ PDF 使用者空間座標（左下原點、未旋轉）。
 * /Rotate 為顯示時順時針旋轉。
 */
export function displayToUser(u: number, v: number, rot: Rotation, box: Box): { x: number; y: number } {
  const { x: bx, y: by, width: bw, height: bh } = box;
  switch (rot) {
    case 0:
      return { x: bx + u * bw, y: by + (1 - v) * bh };
    case 90:
      return { x: bx + v * bw, y: by + u * bh };
    case 180:
      return { x: bx + (1 - u) * bw, y: by + v * bh };
    case 270:
      return { x: bx + (1 - v) * bw, y: by + (1 - u) * bh };
  }
}

/** 顯示中的頁面尺寸（點） */
export function displaySize(rot: Rotation, box: Box): PageSize {
  return rot === 90 || rot === 270 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
}

/**
 * 算出 pdf-lib drawImage 參數：讓圖片在顯示中正立、落在指定相對矩形。
 * pdf-lib 的 rotate 以 (x,y) 為軸逆時針旋轉，正好抵銷頁面的順時針 /Rotate。
 */
export function imageDrawParams(rect: Omit<RelRect, 'page'>, rot: Rotation, box: Box) {
  const ds = displaySize(rot, box);
  const anchor = displayToUser(rect.x, rect.y + rect.h, rot, box);
  return {
    x: anchor.x,
    y: anchor.y,
    width: rect.w * ds.width,
    height: rect.h * ds.height,
    rotateDegrees: rot,
  };
}

/** 等比把簽名（aspect = w/h）放進方框並置中，留 8% 內距 */
export function fitIntoBox(
  field: RelRect,
  aspect: number,
  pageSize: PageSize,
  padding = 0.08,
): RelRect {
  const boxW = field.w * pageSize.width * (1 - padding);
  const boxH = field.h * pageSize.height * (1 - padding);
  let w = boxW;
  let h = w / aspect;
  if (h > boxH) {
    h = boxH;
    w = h * aspect;
  }
  const rw = w / pageSize.width;
  const rh = h / pageSize.height;
  return {
    page: field.page,
    x: field.x + (field.w - rw) / 2,
    y: field.y + (field.h - rh) / 2,
    w: rw,
    h: rh,
  };
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
