/** 簽署人識別色（對白底對比皆 ≥ 4.5:1） */
const PALETTE = ['#2a45c2', '#b3401a', '#0f6b62', '#7e2fc4', '#8a5a00', '#b1123f'];

export function signerColor(index: number) {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/** 畫筆可選顏色（白底對比皆 ≥ 4.5:1） */
export const PEN_COLORS = [
  { value: '#111114', name: '黑' },
  { value: '#d92d20', name: '紅' },
  { value: '#1d4ed8', name: '藍' },
  { value: '#15803d', name: '綠' },
  { value: '#c2410c', name: '橘' },
] as const;

/** 筆寬占頁寬比例（A4 約 1.5／3／6 點） */
export const PEN_SIZES = [
  { value: 0.0025, name: '細' },
  { value: 0.005, name: '中' },
  { value: 0.01, name: '粗' },
] as const;
