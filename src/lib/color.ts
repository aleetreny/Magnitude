/**
 * Mixed at build time rather than with `color-mix()` so the article's washes are
 * plain hex in the stylesheet — one less thing to reason about when a chart is
 * sitting on top of them.
 */
function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** `amount` is how much of `a` survives, 0–1. */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const t = Math.min(1, Math.max(0, amount));
  const channel = (x: number, y: number) =>
    Math.round(x * t + y * (1 - t))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}
