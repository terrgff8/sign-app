import { create } from 'zustand';
import { clamp, fitIntoBox } from '../lib/geometry';
import { openPdf, readPageSizes, type PDFDocumentProxy } from '../lib/pdfjs';
import { requestPersist, saveSession, type Session } from '../lib/storage';
import { uid } from '../lib/uid';
import type { DocMeta, Field, Placement, RelRect, SignatureResult, Signer, WorkState } from '../types';

export type Mode = 'sign' | 'fields' | 'guided';

export type PadTarget = { kind: 'free' } | { kind: 'field'; fieldId: string };

interface Toast {
  id: number;
  text: string;
}

interface AppState {
  meta: DocMeta | null;
  pdfBytes: Uint8Array | null;
  pdf: PDFDocumentProxy | null;
  work: WorkState;
  history: WorkState[];
  mode: Mode;
  guidedSignerId: string | null;
  selectedId: string | null;
  visiblePage: number;
  zoom: number;
  pad: PadTarget | null;
  busy: string | null;
  toast: Toast | null;
  scrollTarget: { page: number; y: number; nonce: number } | null;

  openDocument(name: string, pdfBytes: Uint8Array, opts?: { work?: WorkState; id?: string; sourceDocId?: string }): Promise<void>;
  /** 存成／更新常用文件後，把目前文件連到它 */
  linkSavedDoc(id: string, name: string): void;
  restore(session: Session): Promise<void>;
  /** 回首頁；工作內容保留在自動存檔，可從首頁繼續 */
  leaveDocument(): Promise<void>;

  setMode(mode: Mode): void;
  startGuided(signerId: string): void;
  select(id: string | null): void;
  setVisiblePage(p: number): void;
  setZoom(z: number): void;
  openPad(target: PadTarget | null): void;
  setBusy(text: string | null): void;
  showToast(text: string): void;
  requestScroll(page: number, y: number): void;

  /** 拖曳開始時存一份快照到 undo，拖曳過程用 moveRect 不再存 */
  checkpoint(): void;
  moveRect(id: string, rect: Omit<RelRect, 'page'>): void;
  undo(): void;

  placeFreeSignature(sig: SignatureResult): void;
  signField(fieldId: string, sig: SignatureResult): void;
  removeItem(id: string): void;

  addSigner(name: string): Signer;
  renameSigner(id: string, name: string): void;
  removeSigner(id: string): void;
  moveSigner(id: string, dir: -1 | 1): void;
  addField(signerId: string): void;
  setFieldSigner(fieldId: string, signerId: string): void;
}

const emptyWork = (): WorkState => ({ signers: [], fields: [], placements: [] });
const HISTORY_LIMIT = 50;
let toastSeq = 0;

export const useApp = create<AppState>((set, get) => {
  const commit = (next: WorkState) => {
    const { work, history } = get();
    set({ work: next, history: [...history.slice(-HISTORY_LIMIT + 1), work] });
  };

  return {
    meta: null,
    pdfBytes: null,
    pdf: null,
    work: emptyWork(),
    history: [],
    mode: 'sign',
    guidedSignerId: null,
    selectedId: null,
    visiblePage: 0,
    zoom: 1,
    pad: null,
    busy: null,
    toast: null,
    scrollTarget: null,

    async openDocument(name, pdfBytes, opts = {}) {
      const pdf = await openPdf(pdfBytes);
      const pageSizes = await readPageSizes(pdf);
      await get().pdf?.loadingTask.destroy();
      set({
        meta: { id: opts.id ?? uid(), name, pageSizes, sourceDocId: opts.sourceDocId },
        pdfBytes,
        pdf,
        work: opts.work ?? emptyWork(),
        history: [],
        mode: 'sign',
        guidedSignerId: null,
        selectedId: null,
        visiblePage: 0,
        zoom: 1,
      });
      void requestPersist();
    },

    async restore(session) {
      const { meta } = session;
      await get().openDocument(meta.name, session.pdfBytes, { work: session.work, id: meta.id, sourceDocId: meta.sourceDocId });
    },

    linkSavedDoc(id, name) {
      const { meta } = get();
      if (meta) set({ meta: { ...meta, sourceDocId: id, name } });
    },

    async leaveDocument() {
      clearTimeout(saveTimer);
      const { meta, pdfBytes, work, pdf } = get();
      if (meta && pdfBytes) await saveSession({ meta, pdfBytes, work, savedAt: Date.now() });
      await pdf?.loadingTask.destroy();
      set({ meta: null, pdfBytes: null, pdf: null, work: emptyWork(), history: [], selectedId: null, pad: null });
    },

    setMode: (mode) => set({ mode, selectedId: null, guidedSignerId: mode === 'guided' ? get().guidedSignerId : null }),
    startGuided: (signerId) => set({ mode: 'guided', guidedSignerId: signerId, selectedId: null }),
    select: (selectedId) => set({ selectedId }),
    setVisiblePage: (visiblePage) => set({ visiblePage }),
    setZoom: (z) => set({ zoom: clamp(z, 1, 4) }),
    openPad: (pad) => set({ pad }),
    setBusy: (busy) => set({ busy }),
    showToast: (text) => set({ toast: { id: ++toastSeq, text } }),
    requestScroll: (page, y) => set({ scrollTarget: { page, y, nonce: ++toastSeq } }),

    checkpoint() {
      const { work, history } = get();
      set({ history: [...history.slice(-HISTORY_LIMIT + 1), work] });
    },

    moveRect(id, rect) {
      const { work } = get();
      const patch = <T extends { id: string }>(arr: T[]) => arr.map((it) => (it.id === id ? { ...it, ...rect } : it));
      set({ work: { ...work, fields: patch(work.fields), placements: patch(work.placements) } });
    },

    undo() {
      const { history } = get();
      if (history.length === 0) return;
      set({ work: history[history.length - 1], history: history.slice(0, -1), selectedId: null });
    },

    placeFreeSignature(sig) {
      const { meta, visiblePage, work } = get();
      if (!meta) return;
      const size = meta.pageSizes[visiblePage];
      // 預設寬度約頁寬 30%，置於頁面中央偏下
      const w = 0.3;
      const h = Math.min(0.25, (w * size.width) / sig.aspect / size.height);
      const realW = (h * size.height * sig.aspect) / size.width;
      const placement: Placement = {
        id: uid(),
        page: visiblePage,
        x: (1 - realW) / 2,
        y: 0.6,
        w: realW,
        h,
        pngDataUrl: sig.pngDataUrl,
        aspect: sig.aspect,
      };
      commit({ ...work, placements: [...work.placements, placement] });
      set({ selectedId: placement.id });
    },

    signField(fieldId, sig) {
      const { meta, work } = get();
      const field = work.fields.find((f) => f.id === fieldId);
      if (!meta || !field) return;
      const rect = fitIntoBox(field, sig.aspect, meta.pageSizes[field.page]);
      const placement: Placement = { id: uid(), ...rect, pngDataUrl: sig.pngDataUrl, aspect: sig.aspect, fieldId };
      commit({
        ...work,
        // 重簽：取代同一格原本的簽名
        placements: [...work.placements.filter((p) => p.fieldId !== fieldId), placement],
      });
      set({ selectedId: null });
    },

    removeItem(id) {
      const { work } = get();
      commit({
        ...work,
        fields: work.fields.filter((f) => f.id !== id),
        // 刪方框時一併刪掉框內簽名
        placements: work.placements.filter((p) => p.id !== id && p.fieldId !== id),
      });
      set({ selectedId: null });
    },

    addSigner(name) {
      const { work } = get();
      const signer = { id: uid(), name: name.trim() || `簽署人 ${work.signers.length + 1}` };
      commit({ ...work, signers: [...work.signers, signer] });
      return signer;
    },

    renameSigner(id, name) {
      const { work } = get();
      commit({ ...work, signers: work.signers.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)) });
    },

    removeSigner(id) {
      const { work } = get();
      const fieldIds = new Set(work.fields.filter((f) => f.signerId === id).map((f) => f.id));
      commit({
        signers: work.signers.filter((s) => s.id !== id),
        fields: work.fields.filter((f) => !fieldIds.has(f.id)),
        placements: work.placements.filter((p) => !p.fieldId || !fieldIds.has(p.fieldId)),
      });
    },

    moveSigner(id, dir) {
      const { work } = get();
      const i = work.signers.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= work.signers.length) return;
      const signers = [...work.signers];
      [signers[i], signers[j]] = [signers[j], signers[i]];
      commit({ ...work, signers });
    },

    addField(signerId) {
      const { meta, visiblePage, work } = get();
      if (!meta) return;
      const size = meta.pageSizes[visiblePage];
      // 預設 160×60 點，往下排開不重疊
      const w = Math.min(0.6, 160 / size.width);
      const h = Math.min(0.2, 60 / size.height);
      const slot = work.fields.filter((f) => f.page === visiblePage).length % 5;
      const y = Math.min(1 - h, 0.3 + slot * (h + 0.015));
      const field: Field = { id: uid(), page: visiblePage, x: (1 - w) / 2, y, w, h, signerId };
      commit({ ...work, fields: [...work.fields, field] });
      set({ selectedId: field.id });
    },

    setFieldSigner(fieldId, signerId) {
      const { work } = get();
      commit({ ...work, fields: work.fields.map((f) => (f.id === fieldId ? { ...f, signerId } : f)) });
    },

  };
});

/** 自動存檔：工作內容改變後 800ms 寫入 IndexedDB */
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useApp.subscribe((s, prev) => {
  if (!s.meta || !s.pdfBytes) return;
  if (s.work === prev.work && s.meta === prev.meta) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { meta, pdfBytes, work } = useApp.getState();
    if (meta && pdfBytes) void saveSession({ meta, pdfBytes, work, savedAt: Date.now() });
  }, 800);
});

export const selectors = {
  unsignedFields: (w: WorkState) => w.fields.filter((f) => !w.placements.some((p) => p.fieldId === f.id)),
  signerFields: (w: WorkState, signerId: string) => w.fields.filter((f) => f.signerId === signerId),
};
