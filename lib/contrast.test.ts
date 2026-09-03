import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AA_NORMAL, checkPalette, contrast, over, parseHex, type Palette } from "./contrast";

/**
 * The palette, checked rather than sampled.
 *
 * Reads the real tokens so this cannot drift from what ships. Three contrast
 * bugs reached CI one at a time, each a pair the previous run's seeded data had
 * not happened to render; enumerating the matrix here catches them before a
 * browser is involved.
 */

const CSS = readFileSync(join(process.cwd(), "app", "tokens.css"), "utf8");

/** Reads a `--name: #rrggbb;` declaration from a given block of the file. */
function token(block: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(block);
  if (!match) throw new Error(`token --${name} not found`);
  return match[1];
}

/** Reads the alpha out of `--name: rgb(r g b / 0.14);`. */
function alpha(block: string, name: string): number {
  const match = new RegExp(`--${name}:\\s*rgb\\([^)]*/\\s*([0-9.]+)\\s*\\)`).exec(block);
  if (!match) throw new Error(`alpha for --${name} not found`);
  return Number(match[1]);
}

/** The `:root` block, before any dark override. */
const lightBlock = CSS.slice(0, CSS.indexOf("@media (prefers-color-scheme: dark)"));

/** The explicit `[data-theme="dark"]` block — the manual override. */
const darkBlock = CSS.slice(CSS.indexOf(':root[data-theme="dark"] {'));

function paletteFrom(block: string, washColor: string): Palette {
  // The grey ramp defines the semantic roles; resolve one level of var().
  const grey = (name: string) => token(block, name);
  return {
    bg: grey("g1"),
    bgRaised: washColor === "#ffffff" ? grey("g3") : "#ffffff",
    text: grey("g12"),
    textSecondary: grey("g10"),
    textTertiary: grey("g9"),
    accent: token(block, "accent"),
    accentQuietAlpha: alpha(block, "accent-quiet"),
    pos: token(block, "pos"),
    neg: token(block, "neg"),
    warn: token(block, "warn"),
    quietAlpha: alpha(block, "pos-quiet"),
    hoverAlpha: washColor === "#ffffff" ? 0.045 : 0.035,
    activeAlpha: washColor === "#ffffff" ? 0.075 : 0.05,
    washColor,
  };
}

const PALETTES: [name: string, palette: Palette][] = [
  // In light, the raised surface is white and the washes are near-black.
  ["light", paletteFrom(lightBlock, "#14171c")],
  // In dark, the raised surface is grey step 3 and the washes are white.
  ["dark", paletteFrom(darkBlock, "#ffffff")],
];

describe("palette contrast", () => {
  for (const [name, palette] of PALETTES) {
    describe(name, () => {
      const checks = checkPalette(palette).filter((c) => c.label !== "on-accent text on the accent fill");

      it("clears 4.5:1 for every foreground on every surface it can land on", () => {
        const failures = checks
          .filter((c) => !c.passes)
          .map((c) => `${c.label}: ${c.ratio.toFixed(2)}`);
        expect(failures, failures.join("\n")).toEqual([]);
      });

      it("keeps a margin, so the next background tweak does not break it", () => {
        // The requirement is 4.5. This gate sits at 4.6 because every contrast
        // bug that actually reached CI measured 4.44 or below, and a value that
        // close to the line is one compositing change away from failing —
        // not because 4.6 means anything in the specification.
        const MARGIN = 4.6;
        const thin = checks
          .filter((c) => c.ratio >= AA_NORMAL && c.ratio < MARGIN)
          .map((c) => `${c.label}: ${c.ratio.toFixed(2)}`);
        expect(thin, thin.join("\n")).toEqual([]);
      });
    });
  }

  it("puts readable text on a filled accent button", () => {
    const onAccentLight = token(lightBlock, "text-on-accent");
    const onAccentDark = token(darkBlock, "text-on-accent");
    expect(contrast(parseHex(onAccentLight), parseHex(token(lightBlock, "accent"))))
      .toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(parseHex(onAccentDark), parseHex(token(darkBlock, "accent"))))
      .toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("contrast arithmetic", () => {
  it("agrees with the known extremes", () => {
    expect(contrast(parseHex("#000000"), parseHex("#ffffff"))).toBeCloseTo(21, 5);
    expect(contrast(parseHex("#ffffff"), parseHex("#ffffff"))).toBeCloseTo(1, 5);
  });

  it("expands three-digit hex", () => {
    expect(parseHex("#fff")).toEqual(parseHex("#ffffff"));
  });

  it("composites a wash the way the browser does", () => {
    // 10% black over white is #e6e6e6 to the nearest byte.
    const blended = over(parseHex("#000000"), parseHex("#ffffff"), 0.1);
    expect(blended[0]).toBeCloseTo(0.9, 5);
  });
});
