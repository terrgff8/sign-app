// pdf.js 需要 cmaps（中文等非內嵌字型）、standard_fonts、wasm 解碼器；複製到 public 讓 SW 一起快取。
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'iccs']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
cpSync(join(src, 'wasm'), join(dest, 'wasm'), {
  recursive: true,
  filter: (p) => !/quickjs/i.test(p),
});
