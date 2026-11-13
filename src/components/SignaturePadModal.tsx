import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { trimSignature } from '../lib/signature';
import { saveSignature } from '../lib/storage';
import { uid } from '../lib/uid';
import { useApp } from '../state/store';

const INK = '#111114';

export function SignaturePadModal() {
  const pad = useApp((s) => s.pad);
  const work = useApp((s) => s.work);
  const { openPad, placeFreeSignature, signField, showToast } = useApp.getState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [empty, setEmpty] = useState(true);
  const [remember, setRemember] = useState(false);

  const field = pad?.kind === 'field' ? work.fields.find((f) => f.id === pad.fieldId) : undefined;
  const signer = field ? work.signers.find((s) => s.id === field.signerId) : undefined;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!pad || !canvas) return;
    const sp = new SignaturePad(canvas, {
      minWidth: 1.1,
      maxWidth: 3.4,
      penColor: INK,
      velocityFilterWeight: 0.6,
    });
    padRef.current = sp;
    const onEnd = () => setEmpty(sp.isEmpty());
    sp.addEventListener('endStroke', onEnd);

    // 依實際尺寸設定 canvas 解析度；轉向時保留筆跡
    const fit = () => {
      const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      const data = sp.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      // 筆寬隨簽名板寬度：縮進小方框後粗細才接近真筆（約簽名寬的 1%）
      sp.minWidth = Math.max(1.5, canvas.offsetWidth * 0.006);
      sp.maxWidth = Math.max(3.5, canvas.offsetWidth * 0.014);
      canvas.getContext('2d')!.scale(ratio, ratio);
      sp.clear();
      if (data.length) sp.fromData(data);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      sp.removeEventListener('endStroke', onEnd);
      sp.off();
      padRef.current = null;
    };
  }, [pad]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pad) {
      setEmpty(true);
      setRemember(false);
    }
  }, [pad]);

  if (!pad) return null;

  const clear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };

  const done = async () => {
    const canvas = canvasRef.current;
    if (!canvas || padRef.current?.isEmpty()) return;
    const sig = trimSignature(canvas);
    if (!sig) return;
    if (pad.kind === 'field') {
      signField(pad.fieldId, sig);
    } else {
      placeFreeSignature(sig);
      if (remember) {
        await saveSignature({ id: uid(), ...sig, createdAt: Date.now() });
        showToast('已存到「我的簽名」');
      }
    }
    openPad(null);
  };

  return (
    <div className="pad-modal" role="dialog" aria-modal="true" aria-label="簽名">
      <header className="pad-head">
        <button className="btn ghost" onClick={() => openPad(null)}>
          取消
        </button>
        <div className="pad-title">
          {signer ? (
            <>
              <b>{signer.name}</b> 請在下方簽名
            </>
          ) : (
            '請在下方簽名'
          )}
        </div>
        <button className="btn primary" disabled={empty} onClick={done}>
          完成
        </button>
      </header>
      <div className="pad-area">
        <canvas ref={canvasRef} className="pad-canvas" />
        <div className="pad-baseline" aria-hidden="true" />
        {empty && <p className="pad-hint">用手指或觸控筆簽名・橫拿手機空間更大</p>}
      </div>
      <footer className="pad-foot">
        {pad.kind === 'free' && (
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            存到我的簽名
          </label>
        )}
        <button className="btn ghost" onClick={clear} disabled={empty}>
          清除重簽
        </button>
      </footer>
    </div>
  );
}
