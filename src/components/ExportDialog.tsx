import { useEffect, useState } from 'react';
import { exportSignedPdf } from '../lib/export/exportPdf';
import { shareOrDownload } from '../lib/export/share';
import { selectors, useApp } from '../state/store';
import { Sheet, errorText } from './ui';

type Step = 'confirm' | 'working' | 'ready' | 'error';

/**
 * 先產生 PDF，再讓使用者按「分享／儲存」：
 * iOS 的 navigator.share 必須在點擊當下呼叫，不能隔著長時間的 await。
 */
export function ExportDialog({ onClose }: { onClose(): void }) {
  const work = useApp((s) => s.work);
  const meta = useApp((s) => s.meta)!;
  const pdfBytes = useApp((s) => s.pdfBytes)!;
  const showToast = useApp((s) => s.showToast);
  const unsigned = selectors.unsignedFields(work);
  const [step, setStep] = useState<Step>(unsigned.length > 0 ? 'confirm' : 'working');
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [error, setError] = useState('');
  const fileName = `${meta.name}-已簽.pdf`;

  useEffect(() => {
    if (step !== 'working') return;
    let alive = true;
    exportSignedPdf(pdfBytes, work.placements, work.strokes)
      .then((bytes) => {
        if (!alive) return;
        setResult(bytes);
        setStep('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setError(errorText(e, '產生 PDF 失敗，請再試一次。'));
        setStep('error');
      });
    return () => {
      alive = false;
    };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => {
    if (!result) return;
    const r = await shareOrDownload(result, fileName, 'application/pdf');
    if (r === 'downloaded') showToast('PDF 已儲存');
    if (r !== 'cancelled') onClose();
  };

  const names = [...new Set(unsigned.map((f) => work.signers.find((s) => s.id === f.signerId)?.name ?? '簽署人'))];

  return (
    <Sheet title="儲存 PDF" onClose={onClose}>
      {step === 'confirm' && (
        <>
          <p className="warn">
            還有 <b>{unsigned.length}</b> 個方框沒簽（{names.join('、')}）。空白方框不會出現在儲存的 PDF 上。
          </p>
          <div className="sheet-actions">
            <button className="btn" onClick={onClose}>
              回去簽
            </button>
            <button className="btn primary" onClick={() => setStep('working')}>
              仍要儲存
            </button>
          </div>
        </>
      )}
      {step === 'working' && (
        <p className="center">
          <span className="spinner" aria-hidden="true" /> 正在產生 PDF…
        </p>
      )}
      {step === 'ready' && (
        <>
          <p>
            已完成：<b>{fileName}</b>
          </p>
          <button className="btn primary block" onClick={share}>
            儲存 PDF
          </button>
        </>
      )}
      {step === 'error' && <p className="warn">{error}</p>}
    </Sheet>
  );
}
