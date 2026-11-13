import { useEffect, useState } from 'react';
import { makeSavedDoc } from '../lib/savedDocs';
import { getSavedDoc, putSavedDoc } from '../lib/storage';
import { useApp } from '../state/store';
import type { SavedDoc } from '../types';
import { Sheet, errorText } from './ui';

/** 文件內：把目前檔案＋方框存成常用文件，或更新開啟來源那一份。不存簽名。 */
export function SavedDocSheet({ onClose }: { onClose(): void }) {
  const meta = useApp((s) => s.meta)!;
  const pdfBytes = useApp((s) => s.pdfBytes)!;
  const work = useApp((s) => s.work);
  const { linkSavedDoc, showToast } = useApp.getState();
  const [source, setSource] = useState<SavedDoc | null | undefined>(undefined);
  const [name, setName] = useState(meta.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!meta.sourceDocId) return setSource(null);
    void getSavedDoc(meta.sourceDocId).then((d) => setSource(d ?? null));
  }, [meta.sourceDocId]);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      onClose();
    } catch (e) {
      showToast(errorText(e, '儲存失敗，手機空間可能不足'));
      setSaving(false);
    }
  };

  const saveNew = () =>
    run(async () => {
      const doc = makeSavedDoc(name, meta.pageSizes, work.signers, work.fields);
      await putSavedDoc(doc, pdfBytes);
      linkSavedDoc(doc.id, doc.name);
      showToast(`已存成常用文件「${doc.name}」，下次從首頁直接打開`);
    });

  const update = () =>
    run(async () => {
      if (!source) return;
      const doc = makeSavedDoc(source.name, meta.pageSizes, work.signers, work.fields, source);
      // PDF 一起寫：插入／移除頁後頁數會變
      await putSavedDoc(doc, pdfBytes);
      showToast(`已更新「${doc.name}」`);
    });

  if (source === undefined) return null;

  return (
    <Sheet title="常用文件" onClose={onClose}>
      <p className="muted">
        把這份文件和方框位置存起來，之後從首頁點一下就能開出乾淨的一份直接簽。簽名不會存進去。
      </p>
      {work.fields.length === 0 && <p className="warn">目前還沒有方框。先放好方框再存，之後開啟就能直接點框簽名。</p>}

      {source && (
        <>
          <button className="btn primary block" disabled={saving} onClick={update}>
            更新「{source.name}」
          </button>
          <p className="muted small">用目前的方框、簽署人和頁面（含插入的圖片頁）取代原本的內容。</p>
          <hr className="divider" />
          <p className="small">或另存成一份新的常用文件：</p>
        </>
      )}

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void saveNew();
        }}
      >
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="常用文件名稱"
          placeholder="例如：房屋租賃契約"
          enterKeyHint="done"
        />
        <button className={`btn ${source ? '' : 'primary'}`} type="submit" disabled={saving || !name.trim()}>
          {source ? '另存' : '存成常用文件'}
        </button>
      </form>
    </Sheet>
  );
}
