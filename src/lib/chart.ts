/**
 * Chart tokens for MAGNITUDE.
 *
 * The article page is deliberately white and black so the chart owns the
 * colour. These six hues are the whole series palette, validated as a
 * categorical set against this site's paper surface (#fdfdfc): lightness band,
 * chroma floor, protan/deutan separation (worst adjacent pair ΔE 9.1) and
 * normal-vision separation (ΔE 19.6) all pass.
 *
 * Slots 3, 4 and 5 sit below 3:1 against the paper. That is legal only with a
 * relief channel, so any chart reaching four or more series must carry visible
 * direct labels or a table view — both, in the case of the wage explorer.
 *
 * Assign in order, slot 1 first, and never cycle. A seventh series is not a
 * seventh colour: fold the tail into "other", facet, or change the form.
 *
 * Everything that is not data — axes, ticks, labels, rules — wears the page's
 * own ink tokens, never a series colour.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const;

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
