// 由 public/icons/icon.svg 產生 PWA 需要的 PNG 圖示
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const shots = [
  ['icon-192.png', 192, 0, '0'],
  ['icon-512.png', 512, 0, '0'],
  // iOS 會把透明處填黑，用滿版不圓角（系統自己裁圓角）
  ['apple-touch-icon.png', 180, 0, 'full'],
  // maskable：安全區 80%，外圍補主色
  ['icon-512-maskable.png', 512, 0.1, '0'],
];
for (const [name, size, pad, mode] of shots) {
  const opaque = pad > 0 || mode === 'full';
  const inner = size * (1 - pad * 2);
  await page.setViewportSize({ width: size, height: size });
  const svgBody = opaque ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(
    `<html><body style="margin:0;background:${opaque ? '#2a45c2' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svgBody.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname.slice(1), omitBackground: !opaque });
}
await browser.close();
