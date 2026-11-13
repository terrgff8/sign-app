import type { Field, PageSize, SavedDoc, Signer, WorkState } from '../types';
import { uid } from './uid';

export const BACKUP_KIND = 'kuaiqian-saved-docs';
export const BACKUP_SCHEMA_VERSION = 1;

export class BackupFormatError extends Error {}

export interface BackupDoc {
  name: string;
  pdfBase64: string;
  signers: Signer[];
  fields: Omit<Field, 'id'>[];
  createdAt: number;
}

interface BackupFile {
  kind: typeof BACKUP_KIND;
  schemaVersion: number;
  docs: BackupDoc[];
}

/** 只存簽署人與方框，不存簽名 */
export function makeSavedDoc(
  name: string,
  pageSizes: PageSize[],
  signers: Signer[],
  fields: Omit<Field, 'id'>[],
  base?: SavedDoc,
): SavedDoc {
  const now = Date.now();
  return {
    id: base?.id ?? uid(),
    name: name.trim() || base?.name || '未命名文件',
    pageSizes,
    signers: signers.map((s) => ({ id: s.id, name: s.name })),
    fields: fields.map(({ page, x, y, w, h, signerId }) => ({ page, x, y, w, h, signerId })),
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  };
}

/** 開常用文件：乾淨副本，方框給新 id，沒有任何簽名 */
export function toWorkState(doc: Pick<SavedDoc, 'signers' | 'fields' | 'pageSizes'>): WorkState {
  return {
    signers: doc.signers.map((s) => ({ ...s })),
    fields: doc.fields.filter((f) => f.page < doc.pageSizes.length).map((f) => ({ ...f, id: uid() })),
    placements: [],
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  // 分段，避免大檔 String.fromCharCode 參數過多
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function serializeBackup(docs: { doc: SavedDoc; pdfBytes: Uint8Array }[]): string {
  const file: BackupFile = {
    kind: BACKUP_KIND,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    docs: docs.map(({ doc, pdfBytes }) => ({
      name: doc.name,
      pdfBase64: bytesToBase64(pdfBytes),
      signers: doc.signers,
      fields: doc.fields,
      createdAt: doc.createdAt,
    })),
  };
  return JSON.stringify(file);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isUnit = (v: unknown) => isNum(v) && v >= -0.5 && v <= 1.5;

export interface ParsedBackupDoc {
  name: string;
  pdfBytes: Uint8Array;
  signers: Signer[];
  fields: Omit<Field, 'id'>[];
  createdAt: number;
}

/** 解析備份檔；不合格內容丟 BackupFormatError（訊息可直接給使用者看）。PDF 能否開啟由呼叫端再驗 */
export function parseBackup(text: string): ParsedBackupDoc[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupFormatError('這不是快簽的備份檔（格式錯誤）。');
  }
  const f = data as Partial<BackupFile>;
  if (!f || f.kind !== BACKUP_KIND) throw new BackupFormatError('這不是快簽的備份檔。');
  if (!isNum(f.schemaVersion) || f.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupFormatError('備份檔版本較新，請先更新 App。');
  }
  if (!Array.isArray(f.docs) || f.docs.length === 0) throw new BackupFormatError('備份檔裡沒有文件。');

  return f.docs.map((d, i) => {
    const label = `第 ${i + 1} 份文件`;
    if (!d || !isStr(d.name) || !isStr(d.pdfBase64) || d.pdfBase64.length === 0) {
      throw new BackupFormatError(`${label}資料不完整。`);
    }
    if (!Array.isArray(d.signers) || !d.signers.every((s) => s && isStr(s.id) && isStr(s.name))) {
      throw new BackupFormatError(`${label}的簽署人資料有誤。`);
    }
    const signerIds = new Set(d.signers.map((s) => s.id));
    const fieldsOk =
      Array.isArray(d.fields) &&
      d.fields.every(
        (fd) =>
          fd &&
          Number.isInteger(fd.page) &&
          fd.page >= 0 &&
          isUnit(fd.x) &&
          isUnit(fd.y) &&
          isNum(fd.w) &&
          isNum(fd.h) &&
          fd.w > 0 &&
          fd.h > 0 &&
          isStr(fd.signerId) &&
          signerIds.has(fd.signerId),
      );
    if (!fieldsOk) throw new BackupFormatError(`${label}的方框資料有誤。`);
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = base64ToBytes(d.pdfBase64);
    } catch {
      throw new BackupFormatError(`${label}的檔案內容毀損。`);
    }
    return {
      name: d.name,
      pdfBytes,
      signers: d.signers.map((s) => ({ id: s.id, name: s.name })),
      fields: d.fields.map((fd) => ({ page: fd.page, x: fd.x, y: fd.y, w: fd.w, h: fd.h, signerId: fd.signerId })),
      createdAt: isNum(d.createdAt) ? d.createdAt : Date.now(),
    };
  });
}
