import { useEffect, useMemo } from 'react';
import { signerColor } from '../lib/colors';
import { useApp } from '../state/store';

/** 輪流簽署：目前簽署人的方框依頁序排列，引導逐格簽完再交下一位 */
export function GuidedSignBar() {
  const work = useApp((s) => s.work);
  const signerId = useApp((s) => s.guidedSignerId);
  const { startGuided, setMode, requestScroll, showToast, openPad } = useApp.getState();

  const idx = work.signers.findIndex((s) => s.id === signerId);
  const signer = work.signers[idx];
  const mine = useMemo(
    () =>
      work.fields
        .filter((f) => f.signerId === signerId)
        .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x),
    [work.fields, signerId],
  );
  const signed = new Set(work.placements.map((p) => p.fieldId));
  const doneCount = mine.filter((f) => signed.has(f.id)).length;
  const next = mine.find((f) => !signed.has(f.id));
  const allDone = mine.length > 0 && !next;

  // 下一位：之後第一個還有未簽方框的人
  const nextSigner = work.signers
    .slice(idx + 1)
    .find((s) => work.fields.some((f) => f.signerId === s.id && !signed.has(f.id)));

  useEffect(() => {
    if (next) requestScroll(next.page, next.y);
    // 只在換人或換格時捲動
  }, [signerId, next?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!signer) return null;

  const handOver = () => {
    if (nextSigner) {
      startGuided(nextSigner.id);
      showToast(`請把手機交給「${nextSigner.name}」`);
    } else {
      setMode('sign');
      showToast('全部簽完了，按「儲存」存成 PDF');
    }
  };

  return (
    <div className="guided-bar" style={{ ['--signer' as string]: signerColor(idx) }}>
      <div className="guided-who">
        <span className="signer-dot" aria-hidden="true" />
        <b>{signer.name}</b> 簽署中
        <span className="guided-count">
          {doneCount}/{mine.length} 格
        </span>
      </div>
      <div className="guided-actions">
        <button className="btn ghost" onClick={() => setMode('sign')}>
          結束
        </button>
        {next ? (
          <button className="btn primary" onClick={() => openPad({ kind: 'field', fieldId: next.id })}>
            簽下一格
          </button>
        ) : (
          <button className="btn primary" disabled={!allDone} onClick={handOver}>
            {nextSigner ? `完成，交給「${nextSigner.name}」` : '完成'}
          </button>
        )}
      </div>
    </div>
  );
}
