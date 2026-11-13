import { useState } from 'react';
import { signerColor } from '../lib/colors';
import { useApp } from '../state/store';
import { Sheet } from './ui';

const PRESETS = ['甲方', '乙方', '丙方', '見證人', '立書人', '代理人'];

export function SignerSheet({ onClose, onPicked }: { onClose(): void; onPicked?(id: string): void }) {
  const work = useApp((s) => s.work);
  const { addSigner, renameSigner, removeSigner, moveSigner } = useApp.getState();
  const [name, setName] = useState('');

  const add = (n: string) => {
    const s = addSigner(n);
    onPicked?.(s.id);
    setName('');
  };

  const remove = (id: string, label: string) => {
    const count = work.fields.filter((f) => f.signerId === id).length;
    if (count > 0 && !confirm(`刪除「${label}」會一併刪掉他的 ${count} 個方框，確定？`)) return;
    removeSigner(id);
  };

  const unused = PRESETS.filter((p) => !work.signers.some((s) => s.name === p));

  return (
    <Sheet title="簽署人" onClose={onClose}>
      <p className="muted">輪流簽署時會照這個順序。</p>
      <ol className="signer-list">
        {work.signers.map((s, i) => (
          <li key={s.id} style={{ ['--signer' as string]: signerColor(i) }}>
            <span className="signer-dot" aria-hidden="true" />
            <input
              key={s.name}
              className="input"
              defaultValue={s.name}
              aria-label={`第 ${i + 1} 位簽署人名稱`}
              onBlur={(e) => e.target.value !== s.name && renameSigner(s.id, e.target.value)}
              enterKeyHint="done"
            />
            <button className="icon-btn" aria-label="往前" disabled={i === 0} onClick={() => moveSigner(s.id, -1)}>
              ↑
            </button>
            <button
              className="icon-btn"
              aria-label="往後"
              disabled={i === work.signers.length - 1}
              onClick={() => moveSigner(s.id, 1)}
            >
              ↓
            </button>
            <button className="btn ghost small danger" onClick={() => remove(s.id, s.name)}>
              刪除
            </button>
          </li>
        ))}
      </ol>
      {unused.length > 0 && (
        <div className="chip-row">
          {unused.map((p) => (
            <button key={p} className="chip" onClick={() => add(p)}>
              ＋ {p}
            </button>
          ))}
        </div>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add(name);
        }}
      >
        <input
          className="input"
          value={name}
          placeholder="其他名稱，例如：王小明"
          onChange={(e) => setName(e.target.value)}
          enterKeyHint="done"
        />
        <button className="btn" type="submit" disabled={!name.trim()}>
          新增
        </button>
      </form>
    </Sheet>
  );
}
