import { useEffect, useRef, useState } from 'react';
import { importFile } from '../lib/import';
import { toWorkState } from '../lib/savedDocs';
import { getSavedDocPdf, listSavedDocs, loadSession, type Session } from '../lib/storage';
import type { SavedDoc } from '../types';
import { useApp } from '../state/store';
import { ScanCropper } from './ScanCropper';
import { SignatureLibrary } from './SignatureLibrary';
import { SavedDocsManager } from './SavedDocsManager';
import { errorText } from './ui';

const ACCEPT =
  '.pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*';

export function HomeScreen() {
  const { openDocument, restore, setBusy, showToast } = useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<'docs' | 'signatures' | null>(null);
  const [savedDocs, setSavedDocs] = useState<SavedDoc[]>([]);

  const loadDocs = () => listSavedDocs().then(setSavedDocs);
  useEffect(() => {
    void loadSession().then((s) => setSession(s ?? null));
    void loadDocs();
  }, []);

  // 上次的文件有放簽名才提醒，避免每次開常用文件都被問
  const confirmReplace = () =>
    !session ||
    session.work.placements.length === 0 ||
    confirm(`開新文件會取代上次的「${session.meta.name}」（含已放的簽名），確定？`);

  const openSaved = async (doc: SavedDoc) => {
    if (!confirmReplace()) return;
    setBusy('正在開啟…');
    try {
      const bytes = await getSavedDocPdf(doc.id);
      if (!bytes) throw new Error('找不到這份常用文件的檔案，請刪除後重新建立。');
      await openDocument(doc.name, bytes, { work: toWorkState(doc), sourceDocId: doc.id });
    } catch (e) {
      showToast(errorText(e, '這份常用文件無法開啟'));
    } finally {
      setBusy(null);
    }
  };

  const open = async (file: File) => {
    if (!confirmReplace()) return;
    const isWord = /\.docx$/i.test(file.name);
    setBusy(isWord ? '正在轉換 Word 檔…' : '正在開啟…');
    try {
      const doc = await importFile(file);
      await openDocument(doc.name, doc.pdfBytes);
    } catch (e) {
      showToast(errorText(e, '開啟失敗，檔案可能毀損'));
    } finally {
      setBusy(null);
    }
  };

  const resume = async () => {
    if (!session) return;
    setBusy('正在開啟…');
    try {
      await restore(session);
    } catch (e) {
      showToast(errorText(e, '上次的文件無法開啟'));
    } finally {
      setBusy(null);
    }
  };

  if (scanFile) {
    return (
      <ScanCropper
        file={scanFile}
        onCancel={() => setScanFile(null)}
        onDone={async (bytes) => {
          setScanFile(null);
          setBusy('正在開啟…');
          try {
            await openDocument(`掃描-${new Date().toLocaleDateString('zh-TW').replaceAll('/', '')}`, bytes);
          } finally {
            setBusy(null);
          }
        }}
      />
    );
  }

  return (
    <main className="home">
      <header className="home-head">
        <h1>快簽</h1>
        <p>合約、紙本，拿起手機就簽。</p>
      </header>

      {session && (
        <button className="resume" onClick={resume}>
          <span className="resume-label">繼續上次的文件</span>
          <b>{session.meta.name}</b>
          <small>
            {session.meta.pageSizes.length} 頁・已放 {session.work.placements.length} 個簽名・
            {new Date(session.savedAt).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}
          </small>
        </button>
      )}

      {savedDocs.length > 0 && (
        <section className="saved-docs" aria-labelledby="saved-docs-title">
          <h2 id="saved-docs-title">常用文件</h2>
          <ul>
            {savedDocs.map((d) => (
              <li key={d.id}>
                <button className="saved-doc" onClick={() => openSaved(d)}>
                  <b>{d.name}</b>
                  <small>
                    {d.pageSizes.length} 頁・{d.fields.length} 個方框
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="home-actions">
        <button className="big-action primary" onClick={() => fileRef.current?.click()}>
          <span className="big-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M6 2h8l5 5v15H6z" />
              <path d="M14 2v5h5" />
            </svg>
          </span>
          <span>
            <b>開啟檔案</b>
            <small>PDF・Word・圖片</small>
          </span>
        </button>
        <button className="big-action" onClick={() => camRef.current?.click()}>
          <span className="big-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
              <circle cx="12" cy="13.5" r="3.5" />
            </svg>
          </span>
          <span>
            <b>拍紙本</b>
            <small>拍照後拉正再簽</small>
          </span>
        </button>
      </div>

      <nav className="home-links">
        <button className="link-row" onClick={() => setSheet('docs')}>
          管理常用文件<span aria-hidden="true">›</span>
        </button>
        <button className="link-row" onClick={() => setSheet('signatures')}>
          我的簽名<span aria-hidden="true">›</span>
        </button>
      </nav>

      <p className="home-note">檔案只在這支手機上處理，不會上傳。</p>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void open(f);
        }}
      />
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f && confirmReplace()) setScanFile(f);
        }}
      />

      {sheet === 'docs' && <SavedDocsManager onClose={() => setSheet(null)} onChanged={() => void loadDocs()} />}
      {sheet === 'signatures' && <SignatureLibrary manage onClose={() => setSheet(null)} />}
    </main>
  );
}
