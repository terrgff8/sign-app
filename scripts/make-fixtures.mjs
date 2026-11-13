// 產生 E2E 測試用檔案：多頁 PDF（含旋轉頁）、Word（中文＋表格＋分頁）、紙本照片
import { PDFDocument, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';
import JSZip from 'jszip';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../tests/fixtures/', import.meta.url);
mkdirSync(dir, { recursive: true });
const out = (name) => new URL(name, dir).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ---- PDF ----
{
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Sample Contract - page ${i + 1}`, { x: 60, y: 770, size: 22, font });
    for (let l = 0; l < 18; l++) page.drawRectangle({ x: 60, y: 700 - l * 26, width: 470 - (l % 4) * 40, height: 8, color: rgb(0.85, 0.85, 0.85) });
    page.drawText('Signature:', { x: 60, y: 120, size: 14, font });
    page.drawLine({ start: { x: 140, y: 118 }, end: { x: 360, y: 118 }, thickness: 1 });
    if (i === 2) page.setRotation(degrees(90));
  }
  writeFileSync(out('contract.pdf'), await pdf.save());
}

// ---- DOCX ----
{
  const p = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const cell = (t) => `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>${p(t)}</w:tc>`;
  const table = `<w:tbl><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:color="000000"/>`)
    .join('')}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>
    <w:tr>${cell('項目')}${cell('金額')}</w:tr><w:tr>${cell('租金')}${cell('NT$ 25,000')}</w:tr></w:tbl>`;
  const body =
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="40"/></w:rPr><w:t>房屋租賃契約書</w:t></w:r></w:p>` +
    p('立契約書人：出租人（以下簡稱甲方）、承租人（以下簡稱乙方），雙方同意訂立本契約。') +
    p('第一條　租賃標的：台北市某區某路一段一號。') +
    table +
    p('第二條　租賃期間：自民國一一五年一月一日起至一一六年十二月三十一日止。') +
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
    p('第三條　其他約定事項依民法相關規定辦理。') +
    p('甲方簽章：') +
    p('乙方簽章：') +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr>`;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  writeFileSync(out('lease.docx'), await zip.generateAsync({ type: 'nodebuffer' }));
}

// ---- 紙本照片（歪斜的紙放在深色桌面）----
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  await page.setContent(`<body style="margin:0;background:#3b3226;height:1600px;display:grid;place-items:center">
    <div style="width:760px;height:1060px;background:#fbfaf6;transform:perspective(1400px) rotateX(12deg) rotate(-4deg);padding:70px;box-sizing:border-box;font:28px serif">
      <h1 style="text-align:center">切結書</h1>${'<p style="height:18px;background:#ddd;margin:22px 0"></p>'.repeat(14)}
      <p>立書人簽名：＿＿＿＿＿＿＿＿</p></div></body>`);
  await page.screenshot({ path: out('paper.jpg'), type: 'jpeg', quality: 85 });
  await browser.close();
}
console.log('fixtures ok');
