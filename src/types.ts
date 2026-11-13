/** 頁面顯示方向（套用 /Rotate 後）的尺寸，單位 PDF 點 */
export interface PageSize {
  width: number;
  height: number;
}

/** 0–1 相對座標，原點為「顯示中頁面」左上角 */
export interface RelRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Signer {
  id: string;
  name: string;
}

export interface Field extends RelRect {
  id: string;
  signerId: string;
}

export interface Placement extends RelRect {
  id: string;
  pngDataUrl: string;
  /** 簽名圖原始像素比例 w/h，縮放時鎖定 */
  aspect: number;
  fieldId?: string;
}

export interface DocMeta {
  id: string;
  name: string;
  pageSizes: PageSize[];
  /** 從哪份常用文件開出來的（更新常用文件用） */
  sourceDocId?: string;
}

export interface WorkState {
  signers: Signer[];
  fields: Field[];
  placements: Placement[];
}

/** 常用文件：PDF＋簽署人＋方框；PDF bytes 另存（見 storage.ts） */
export interface SavedDoc {
  id: string;
  name: string;
  pageSizes: PageSize[];
  signers: Signer[];
  fields: Omit<Field, 'id'>[];
  createdAt: number;
  updatedAt: number;
}

export interface SavedSignature {
  id: string;
  pngDataUrl: string;
  aspect: number;
  createdAt: number;
}

export interface SignatureResult {
  pngDataUrl: string;
  aspect: number;
}
