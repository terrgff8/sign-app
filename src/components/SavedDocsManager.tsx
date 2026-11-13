import { useEffect, useRef, useState } from 'react';
import { shareOrDownload } from '../lib/export/share';
import { openPdf, readPageSizes } from '../lib/pdfjs';
import { makeSavedDoc, parseBackup, serializeBackup } from '../lib/savedDocs';
import { deleteSavedDoc, getSavedDocPdf, listSavedDocs, putSavedDoc } from '../lib/storage';
import { useApp } from '../state/store';
import type { SavedDoc } from '../types';
import { Sheet, errorText } from './ui';

interface Prepared {
  fileName: string;
  text: string;
}

/** 首頁：管理常用文件（刪除、匯出備份、匯入） */
export function SavedDocsManager({ onClose, onChanged }: { onClose(): void; onChanged(): void }) {
  const { showToast } = useApp.getState();
  const [list, setList] = useState<SavedDoc[]>([]);
  const [busy, setBusy] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setList(await listSavedDocs());
    onChanged();
  };
  useEffect(() => {
    void listSavedDocs().then(setList);
  }, []);

  const remove = async (d: SavedDoc) => {
    if (!confirm(`刪除常用文件「${d.name}」？這個動作無法復原。`)) return;
    await deleteSavedDoc(d.id);
    await reload();
  };

  // 先讀檔、組好備份檔，再讓使用者按「儲存備份檔」：iOS 分享必須在點擊當下呼叫
  const prepare = async (docs: SavedDoc[], all = false) => {
    setBusy('正在準備備份檔…');
    try {
      const items = [];
      for (const doc of docs) {
        const pdfBytes = await getSavedDocPdf(doc.id);
        if (pdfBytes) items.push({ doc, pdfBytes });
      }
      const fileName = !all ? `${docs[0].name}.kuaiqian.json` : `快簽常用文件備份-${items.length}份.kuaiqian.json`;
      setPrepared({ fileName, text: serializeBackup(items) });
    } catch (e) {
      showToast(errorText(e, '準備備份檔失敗'));
    } finally {
      setBusy('');
    }
  };

  const saveBackup = async () => {
    if (!prepared) return;
    const r = await shareOrDownload(prepared.text, prepared.fileName, 'application/json');
    if (r === 'downloaded') showToast('備份檔已儲存');
    if (r !== 'cancelled') setPrepared(null);
  };

  const importFile = async (file: File) => {
    setBusy('正在匯入…');
    try {
      const docs = parseBackup(await file.text());
      let ok = 0;
      for (const d of docs) {
        let pageSizes;
        try {
          const pdf = await openPdf(d.pdfBytes);
          pageSizes = await readPageSizes(pdf);
          await pdf.loadingTask.destroy();
        } catch {
          continue;
        }
        await putSavedDoc(makeSavedDoc(d.name, pageSizes, d.signers, d.fields), d.pdfBytes);
        ok++;
      }
      showToast(ok === docs.length ? `已匯入 ${ok} 份常用文件` : `已匯入 ${ok} 份，${docs.length - ok} 份檔案毀損略過`);
      await reload();
    } catch (e) {
      showToast(errorText(e, '匯入失敗'));
    } finally {
      setBusy('');
    }
  };

  return (
    <Sheet title="管理常用文件" onClose={onClose}>
      {prepared && (
        <div className="ready-box">
          <p>
            備份檔已準備好：<b>{prepared.fileName}</b>
          </p>
          <button className="btn primary block" onClick={saveBackup}>
            儲存備份檔
          </button>
        </div>
      )}
      {busy && (
        <p className="center">
          <span className="spinner" aria-hidden="true" /> {busy}
        </p>
      )}

      <ul className="tpl-list">
        {list.map((d) => (
          <li key={d.id}>
            <div className="tpl-info">
              <b>{d.name}</b>
              <small>
                {d.pageSizes.length} 頁・{d.fields.length} 個方框
                {d.signers.length > 0 && `・${d.signers.map((s) => s.name).join('、')}`}
              </small>
            </div>
            <div className="tpl-actions">
              <button className="btn small" disabled={!!busy} onClick={() => prepare([d])}>
                匯出
              </button>
              <button className="btn small ghost danger" disabled={!!busy} onClick={() => remove(d)}>
                刪除
              </button>
            </div>
          </li>
        ))}
        {list.length === 0 && <li className="muted">還沒有常用文件。打開文件、放好方框後，在「設定方框」按「常用文件」存起來。</li>}
      </ul>

      <div className="sheet-actions">
        <button className="btn" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          匯入備份檔
        </button>
        <button className="btn" disabled={!!busy || list.length === 0} onClick={() => prepare(list, true)}>
          全部匯出備份
        </button>
      </div>
      <p className="muted small">常用文件只存在這支手機的瀏覽器裡。換手機或清除瀏覽器資料前，請先「全部匯出備份」。</p>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importFile(f);
        }}
      />
    </Sheet>
  );
}
