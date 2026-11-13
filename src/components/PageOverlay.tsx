import { useApp } from '../state/store';
import { signerColor } from '../lib/colors';
import { OverlayItem } from './OverlayItem';
import type { Field, Placement } from '../types';

interface Props {
  page: number;
  pageW: number;
  pageH: number;
}

export function PageOverlay({ page, pageW, pageH }: Props) {
  const work = useApp((s) => s.work);
  const mode = useApp((s) => s.mode);
  const guidedSignerId = useApp((s) => s.guidedSignerId);
  const selectedId = useApp((s) => s.selectedId);
  const { select, checkpoint, moveRect, openPad, showToast } = useApp.getState();

  const fields = work.fields.filter((f) => f.page === page);
  const placements = work.placements.filter((p) => p.page === page);
  const signedFieldIds = new Set(work.placements.map((p) => p.fieldId).filter(Boolean));
  const signerIndex = (id: string) => work.signers.findIndex((s) => s.id === id);
  const signerName = (id: string) => work.signers.find((s) => s.id === id)?.name ?? '簽署人';
  const fieldOwner = new Map(work.fields.map((f) => [f.id, f.signerId]));

  const fieldInteraction = (signed: boolean) => {
    if (mode === 'fields') return 'edit' as const;
    return signed ? ('none' as const) : ('tap' as const);
  };

  const onFieldTap = (f: Field) => {
    if (mode === 'fields') return select(f.id);
    if (mode === 'guided' && f.signerId !== guidedSignerId) {
      return showToast(`這格是「${signerName(f.signerId)}」要簽的`);
    }
    openPad({ kind: 'field', fieldId: f.id });
  };

  const placementInteraction = (p: Placement) => {
    if (mode === 'fields') return 'none' as const;
    if (mode === 'guided') return p.fieldId && fieldOwner.get(p.fieldId) === guidedSignerId ? ('edit' as const) : ('none' as const);
    return 'edit' as const;
  };

  return (
    <div className="page-overlay">
      {fields.map((f) => {
        const signed = signedFieldIds.has(f.id);
        const color = signerColor(signerIndex(f.signerId));
        const isMine = mode !== 'guided' || f.signerId === guidedSignerId;
        return (
          <OverlayItem
            key={f.id}
            rect={f}
            pageW={pageW}
            pageH={pageH}
            interaction={fieldInteraction(signed)}
            selected={selectedId === f.id}
            className={`field ${signed ? 'is-signed' : ''} ${mode === 'guided' && isMine && !signed ? 'is-current' : ''} ${
              isMine ? '' : 'is-other'
            }`}
            style={{ ['--signer' as string]: color }}
            label={`${signerName(f.signerId)}的簽名欄${signed ? '（已簽）' : ''}`}
            onTap={() => onFieldTap(f)}
            onDragStart={checkpoint}
            onChange={(r) => moveRect(f.id, r)}
          >
            {(!signed || mode === 'fields') && (
              <span className="field-label">
                <b>{signerName(f.signerId)}</b>
                {mode !== 'fields' && !signed && <small>點此簽名</small>}
              </span>
            )}
          </OverlayItem>
        );
      })}
      {placements.map((p) => (
        <OverlayItem
          key={p.id}
          rect={p}
          pageW={pageW}
          pageH={pageH}
          aspect={p.aspect}
          interaction={placementInteraction(p)}
          selected={selectedId === p.id}
          className={`placement ${mode === 'fields' ? 'is-dim' : ''}`}
          label="簽名"
          onTap={() => select(p.id)}
          onDragStart={checkpoint}
          onChange={(r) => moveRect(p.id, r)}
        >
          <img src={p.pngDataUrl} alt="" draggable={false} />
        </OverlayItem>
      ))}
    </div>
  );
}

