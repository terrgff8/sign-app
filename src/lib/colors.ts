/** 簽署人識別色（對白底對比皆 ≥ 4.5:1） */
const PALETTE = ['#2a45c2', '#b3401a', '#0f6b62', '#7e2fc4', '#8a5a00', '#b1123f'];

export function signerColor(index: number) {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}
