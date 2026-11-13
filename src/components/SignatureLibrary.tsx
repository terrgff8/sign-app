import { useEffect, useState } from 'react';
import { deleteSignature, listSignatures } from '../lib/storage';
import { useApp } from '../state/store';
import type { SavedSignature } from '../types';
import { Sheet } from './ui';

/** 自由簽：選已存的簽名或畫新的；manage 模式（首頁）只能刪除 */
export function SignatureLibrary({ onClose, manage = false }: { onClose(): void; manage?: boolean }) {
  const [list, setList] = useState<SavedSignature[] | null>(null);
  const { placeFreeSignature, openPad } = useApp.getState();

  useEffect(() => {
    void listSignatures().then(setList);
  }, []);

  const remove = async (id: string) => {
    if (!confirm('刪除這個簽名？')) return;
    await deleteSignature(id);
    setList((l) => l?.filter((s) => s.id !== id) ?? null);
  };

  return (
    <Sheet title={manage ? '我的簽名' : '新增簽名'} onClose={onClose}>
      {!manage && (
        <button
          className="btn primary block"
          onClick={() => {
            onClose();
            openPad({ kind: 'free' });
          }}
        >
          畫一個新簽名
        </button>
      )}
      {list && list.length === 0 && (
        <p className="muted">{manage ? '還沒有存任何簽名。簽名時勾選「存到我的簽名」就會出現在這裡。' : ''}</p>
      )}
      {list && list.length > 0 && (
        <>
          {!manage && <p className="muted">或點一個已存的簽名直接放上：</p>}
          <ul className="sig-grid">
            {list.map((s) => (
              <li key={s.id} className="sig-card">
                <button
                  className="sig-pick"
                  disabled={manage}
                  onClick={() => {
                    placeFreeSignature({ pngDataUrl: s.pngDataUrl, aspect: s.aspect });
                    onClose();
                  }}
                  aria-label="使用這個簽名"
                >
                  <img src={s.pngDataUrl} alt="已存的簽名" />
                </button>
                <button className="btn ghost small danger" onClick={() => remove(s.id)}>
                  刪除
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
