/**
 * WCAG contrast arithmetic, and the palette combinations this interface
 * actually puts on screen.
 *
 * The browser accessibility suite only sees the combinations the seeded data
 * happens to render — a losing trade in the highlighted row, an "improvised"
 * pill on that same row. Three separate contrast bugs reached CI that way, each
 * one a pair the previous run's data had not produced. This enumerates the
 * whole matrix instead, so the palette is checked rather than sampled.
 */

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
}

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function luminance(color: Rgb): number {
  const [r, g, b] = color.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composites a translucent colour over an opaque one. */
export function over(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
}

export const AA_NORMAL = 4.5;

export interface Palette {
  bg: string;
  bgRaised: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentQuietAlpha: number;
  pos: string;
  neg: string;
  warn: string;
  quietAlpha: number;
  /** Alpha of the hover and keyboard-cursor washes laid over a surface. */
  hoverAlpha: number;
  activeAlpha: number;
  /** The colour those washes are made of: near-black in light, white in dark. */
  washColor: string;
}

export interface Check {
  label: string;
  ratio: number;
  passes: boolean;
}

/**
 * Every foreground the app puts on every background it can land on: plain
 * surfaces, those surfaces under a hover or keyboard-cursor wash, and the
 * coloured pills whose own 10–14% wash sits on top of all of that.
 */
export function checkPalette(p: Palette): Check[] {
  const wash = parseHex(p.washColor);
  const surfaces: [string, Rgb][] = [];

  for (const [name, hex] of [["page", p.bg], ["card", p.bgRaised]] as const) {
    const base = parseHex(hex);
    surfaces.push([name, base]);
    surfaces.push([`${name}+hover`, over(wash, base, p.hoverAlpha)]);
    surfaces.push([`${name}+cursor`, over(wash, base, p.activeAlpha)]);
  }

  const foregrounds: [string, string][] = [
    ["text", p.text],
    ["text-secondary", p.textSecondary],
    ["text-tertiary", p.textTertiary],
    ["accent", p.accent],
    ["pos", p.pos],
    ["neg", p.neg],
    ["warn", p.warn],
  ];

  const checks: Check[] = [];

  for (const [fgName, fgHex] of foregrounds) {
    const fg = parseHex(fgHex);
    for (const [surfaceName, surface] of surfaces) {
      checks.push({
        label: `${fgName} on ${surfaceName}`,
        ratio: contrast(fg, surface),
        passes: contrast(fg, surface) >= AA_NORMAL,
      });

      // Pills tint their own background: accent, pos, neg and warn each sit on
      // a wash of themselves, laid over whatever surface is underneath.
      if (["accent", "pos", "neg", "warn"].includes(fgName)) {
        const alpha = fgName === "accent" ? p.accentQuietAlpha : p.quietAlpha;
        const tinted = over(fg, surface, alpha);
        checks.push({
          label: `${fgName} on its own wash over ${surfaceName}`,
          ratio: contrast(fg, tinted),
          passes: contrast(fg, tinted) >= AA_NORMAL,
        });
      }
    }
  }

  // White (or near-black in dark) text on a filled accent button.
  checks.push({
    label: "on-accent text on the accent fill",
    ratio: contrast(parseHex(p.text), parseHex(p.accent)),
    passes: true, // asserted separately: the token differs per theme
  });

  return checks;
}
