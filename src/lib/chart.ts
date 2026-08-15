/**
 * Chart tokens for MAGNITUDE.
 *
 * The article page is deliberately white and black so the chart owns the
 * colour. These two hues are the whole series palette — validated as a
 * categorical pair against this site's paper surface (#fdfdfc): lightness band,
 * chroma floor, protan/deutan separation (ΔE 24.7), normal-vision separation
 * (ΔE 33.6) and ≥ 3:1 contrast all pass. Assign them in order, slot 1 first,
 * and never cycle: a third series means folding the tail into "other",
 * faceting, or a different form.
 *
 * Everything that is not data — axes, ticks, labels, rules — wears the page's
 * own ink tokens, never a series colour.
 */
export const SERIES = ['#2a78d6', '#eb6834'] as const;

export interface FormatOptions {
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export function formatValue(value: number, { decimals = 0, prefix = '', suffix = '' }: FormatOptions = {}): string {
  const n = value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${prefix}${n}${suffix}`;
}
