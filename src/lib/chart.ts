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
 * direct labels or a table view, both, in the case of the wage explorer.
 *
 * Assign in order, slot 1 first, and never cycle. A seventh series is not a
 * seventh colour: fold the tail into "other", facet, or change the form.
 *
 * Everything that is not data, axes, ticks, labels, rules, wears the page's
 * own ink tokens, never a series colour.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const;

/**
 * A second, separate set for charts that stack the parts of one whole rather
 * than lay series side by side. Stacking asks a different question of colour:
 * what matters is telling each band from the one touching it, and the bands
 * touch in a fixed order, so the set is validated on adjacent pairs in exactly
 * the order below.
 *
 * Against this site's paper (#fdfdfc): lightness band and chroma floor pass on
 * all five; worst adjacent pair is plum against teal at CVD ΔE 9.8, and worst
 * adjacent normal-vision pair is gold against brick at ΔE 17.2. The gold sits
 * at 2.4:1 on paper, below the 3:1 line, which is legal only with a relief
 * channel, so any chart using this set carries visible labels on the bands
 * themselves rather than a legend to match up by eye.
 *
 * There is no sixth colour. A residual band, the part of a whole that is left
 * once the named parts are counted, is drawn as a hatch: it is not a category
 * and should not look like one.
 */
export const BANDS = ['#4a5fc4', '#c85a4a', '#d39b23', '#0f9e86', '#9a5aa8'] as const;

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
