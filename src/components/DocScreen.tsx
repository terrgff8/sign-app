import { useState } from 'react';
import { signerColor } from '../lib/colors';
import { listSignatures } from '../lib/storage';
import { selectors, useApp } from '../state/store';
import { DocumentViewer } from './DocumentViewer';
import { ExportDialog } from './ExportDialog';
import { GuidedSignBar } from './GuidedSignBar';
import { SignatureLibrary } from './SignatureLibrary';
import { SignerSheet } from './SignerSheet';
import { SavedDocSheet } from './SavedDocSheet';

type SheetName = 'library' | 'signers' | 'savedDoc' | 'export' | null;

export function DocScreen() {
  const meta = useApp((s) => s.meta)!;
  const work = useApp((s) => s.work);
  const mode = useApp((s) => s.mode);
  const selectedId = useApp((s) => s.selectedId);
  const zoom = useApp((s) => s.zoom);
  const canUndo = useApp((s) => s.history.length > 0);
  const { leaveDocument, setMode, undo, select, removeItem, addField, addSigner, setFieldSigner, startGuided, openPad, setZoom } =
    useApp.getState();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [activeSignerId, setActiveSignerId] = useState<string | null>(null);

  const activeSigner = work.signers.find((s) => s.id === activeSignerId) ?? work.signers[0];
  const selectedField = work.fields.find((f) => f.id === selectedId);
  const selectedPlacement = work.placements.find((p) => p.id === selectedId);
  const unsigned = selectors.unsignedFields(work);

  const newField = () => {
    const signer = activeSigner ?? addSigner('甲方');
    setActiveSignerId(signer.id);
    addField(signer.id);
  };

  // 沒存過簽名就直接開簽名板，少一步
  const addSignature = async () => {
    const saved = await listSignatures();
    if (saved.length === 0) openPad({ kind: 'free' });
    else setSheet('library');
  };

  const startTurns = () => {
    const first = work.signers.find((s) => unsigned.some((f) => f.signerId === s.id));
    if (first) startGuided(first.id);
  };

  const bottom = () => {
    if (mode === 'guided') return <GuidedSignBar />;

    if (selectedPlacement && mode === 'sign') {
      return (
        <div className="toolbar">
          <span className="toolbar-hint">拖曳移動・拉四角縮放</span>
          {selectedPlacement.fieldId && (
            <button className="btn" onClick={() => openPad({ kind: 'field', fieldId: selectedPlacement.fieldId! })}>
              重簽
            </button>
          )}
          <button className="btn danger" onClick={() => removeItem(selectedPlacement.id)}>
            刪除
          </button>
          <button className="btn primary" onClick={() => select(null)}>
            完成
          </button>
        </div>
      );
    }

    if (mode === 'fields') {
      return (
        <div className="toolbar column">
          {selectedField && (
            <div className="toolbar-row selected-row">
              <span className="toolbar-hint">選取的方框：</span>
              <label className="select-wrap">
                <span className="sr-only">這格給誰簽</span>
                <select
                  className="input"
                  value={selectedField.signerId}
                  onChange={(e) => setFieldSigner(selectedField.id, e.target.value)}
                >
                  {work.signers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn danger" onClick={() => removeItem(selectedField.id)}>
                刪除
              </button>
            </div>
          )}
          <div className="signer-chips" role="radiogroup" aria-label="新方框給誰簽">
            {work.signers.map((s, i) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={activeSigner?.id === s.id}
                className={`chip signer-chip ${activeSigner?.id === s.id ? 'is-on' : ''}`}
                style={{ ['--signer' as string]: signerColor(i) }}
                onClick={() => setActiveSignerId(s.id)}
              >
                <span className="signer-dot" aria-hidden="true" />
                {s.name}
              </button>
            ))}
            <button className="chip" onClick={() => setSheet('signers')}>
              {work.signers.length ? '編輯簽署人' : '＋ 簽署人'}
            </button>
          </div>
          <div className="toolbar-row">
            <button className="btn" onClick={() => setSheet('savedDoc')}>
              常用文件
            </button>
            <button className="btn primary grow" onClick={newField}>
              ＋ 新增{activeSigner ? `「${activeSigner.name}」的` : ''}方框
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="toolbar">
        {work.fields.length > 0 && (
          <button className="btn grow" onClick={startTurns} disabled={unsigned.length === 0}>
            {unsigned.length ? `輪流簽署（${unsigned.length} 格）` : '方框都簽好了'}
          </button>
        )}
        <button className="btn primary grow" onClick={() => void addSignature()}>
          ＋ 新增簽名
        </button>
      </div>
    );
  };

  return (
    <div className="doc">
      <header className="topbar">
        <button className="btn ghost" onClick={() => void leaveDocument()} aria-label="回首頁">
          ‹ 首頁
        </button>
        <h1 className="doc-title">{meta.name}</h1>
        <button className="btn ghost" onClick={undo} disabled={!canUndo} aria-label="復原">
          復原
        </button>
        <button className="btn primary" onClick={() => setSheet('export')}>
          儲存
        </button>
      </header>

      {mode !== 'guided' && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'sign'} className="tab" onClick={() => setMode('sign')}>
            簽名
          </button>
          <button role="tab" aria-selected={mode === 'fields'} className="tab" onClick={() => setMode('fields')}>
            設定方框{work.fields.length ? `（${work.fields.length}）` : ''}
          </button>
        </div>
      )}

      <div className="viewer-wrap">
        <DocumentViewer />
        {zoom > 1.01 && (
          <button className="zoom-reset" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%・還原
          </button>
        )}
      </div>

      <footer className="bottombar">{bottom()}</footer>

      {sheet === 'library' && <SignatureLibrary onClose={() => setSheet(null)} />}
      {sheet === 'signers' && <SignerSheet onClose={() => setSheet(null)} onPicked={setActiveSignerId} />}
      {sheet === 'savedDoc' && <SavedDocSheet onClose={() => setSheet(null)} />}
      {sheet === 'export' && <ExportDialog onClose={() => setSheet(null)} />}
    </div>
  );
}
