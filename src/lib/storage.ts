import { createStore, del, entries, get, set } from 'idb-keyval';
import type { DocMeta, SavedDoc, SavedSignature, WorkState } from '../types';

const db = createStore('kuaiqian', 'kv');
// 清單與 PDF 分開存：首頁列清單時不必把每份 PDF 讀進記憶體
const docDb = createStore('kuaiqian-docs', 'docs');
const docPdfDb = createStore('kuaiqian-doc-pdfs', 'pdfs');
const sigDb = createStore('kuaiqian-signatures', 'signatures');

export interface Session {
  meta: DocMeta;
  pdfBytes: Uint8Array;
  work: WorkState;
  savedAt: number;
}

const SESSION_KEY = 'session';

/** 要求瀏覽器不要自動清掉資料（iOS 加到主畫面後較有效） */
export async function requestPersist() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* 不支援就算了 */
  }
}

export const loadSession = () => get<Session>(SESSION_KEY, db);
export const saveSession = (s: Session) => set(SESSION_KEY, s, db);
export const clearSession = () => del(SESSION_KEY, db);

export async function listSavedDocs(): Promise<SavedDoc[]> {
  const all = await entries<string, SavedDoc>(docDb);
  return all.map(([, d]) => d).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getSavedDoc = (id: string) => get<SavedDoc>(id, docDb);
export const getSavedDocPdf = (id: string) => get<Uint8Array>(id, docPdfDb);
/** 先寫 PDF 再寫清單，中途失敗不會出現沒有檔案的清單項目 */
export async function putSavedDoc(doc: SavedDoc, pdfBytes?: Uint8Array) {
  if (pdfBytes) await set(doc.id, pdfBytes, docPdfDb);
  await set(doc.id, doc, docDb);
}
export async function deleteSavedDoc(id: string) {
  await del(id, docDb);
  await del(id, docPdfDb);
}

export async function listSignatures(): Promise<SavedSignature[]> {
  const all = await entries<string, SavedSignature>(sigDb);
  return all.map(([, s]) => s).sort((a, b) => b.createdAt - a.createdAt);
}
export const saveSignature = (s: SavedSignature) => set(s.id, s, sigDb);
export const deleteSignature = (id: string) => del(id, sigDb);
