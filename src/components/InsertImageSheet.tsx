import { useRef } from 'react';
import { canvasToBlob, decodeImage } from '../lib/import/image';
import type { PageImage } from '../lib/import/imagesToPdf';
import { useApp } from '../state/store';
import { Sheet, errorText } from './ui';

/** 長邊上限：避免手機記憶體與 PDF 過大 */
const MAX_EDGE = 2000;

/** PNG 保留 PNG（透明背景），其他一律轉 JPEG */
async function prepare(file: File) {
  const canvas = await decodeImage(file, MAX_EDGE);
  const isPng = file.type === 'image/png';
  const type = isPng ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, type, 0.9);
  return { canvas, type, blob, isPng };
}

export function InsertImageSheet({ onClose }: { onClose(): void }) {
  const overlayRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<HTMLInputElement>(null);
  const visiblePage = useApp((s) => s.visiblePage);
  const { placeImage, insertPages, setBusy, showToast } = useApp.getState();

  const addOverlay = async (file: File) => {
    onClose();
    setBusy('正在處理圖片…');
    try {
      const { canvas, type } = await prepare(file);
      placeImage(canvas.toDataURL(type, 0.9), canvas.width / canvas.height);
    } catch (e) {
      showToast(errorText(e, '無法讀取這張圖片'));
    } finally {
      setBusy(null);
    }
  };

  const addPages = async (files: File[]) => {
    onClose();
    setBusy(`正在加入 ${files.length} 頁…`);
    try {
      const images: PageImage[] = [];
      for (const f of files) {
        const { blob, isPng } = await prepare(f);
        images.push({ bytes: new Uint8Array(await blob.arrayBuffer()), type: isPng ? 'png' : 'jpeg' });
      }
      await insertPages(images);
      showToast(`已在第 ${visiblePage + 1} 頁後加入 ${files.length} 頁`);
    } catch (e) {
      showToast(errorText(e, '加入頁面失敗'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet title="插入圖片" onClose={onClose}>
      <button className="big-action" onClick={() => overlayRef.current?.click()}>
        <span>
          <b>疊在頁面上</b>
          <small>例如印章、證件照、Logo，可拖移縮放</small>
        </span>
      </button>
      <button className="big-action" onClick={() => pagesRef.current?.click()}>
        <span>
          <b>加成新的一頁</b>
          <small>插在第 {visiblePage + 1} 頁後面，可一次選多張</small>
        </span>
      </button>
      <input
        ref={overlayRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void addOverlay(f);
        }}
      />
      <input
        ref={pagesRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (fs.length) void addPages(fs);
        }}
      />
    </Sheet>
  );
}
