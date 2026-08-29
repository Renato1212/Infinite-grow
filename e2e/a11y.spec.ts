import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * §7's quality floor, checked rather than asserted: contrast, names, roles and
 * structure on every screen, in both themes.
 *
 * Needs a running app with seeded data. Colour-contrast is included on purpose —
 * it is the rule a hand-tuned palette breaks most easily.
 */

/**
 * The seeded days are the last forty weekdays, so their dates move with the
 * calendar and cannot be written into the test. Ask the app which day has data:
 * an empty day renders far fewer controls, and passing against one would mean
 * very little.
 */
async function populatedDay(page: Page): Promise<string> {
  await page.goto("/trades", { waitUntil: "networkidle" });
  const href = await page
    .locator('a[href^="/day/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  const date = href?.match(/\/day\/(\d{4}-\d{2}-\d{2})/)?.[1];
  // No trades at all is a legitimate state — fall back to today rather than
  // failing, and the run still checks the empty cockpit.
  return date ?? new Date().toISOString().slice(0, 10);
}

async function violationsOn(page: Page, path: string) {
  // axe reads computed colours, and an element caught mid-transition reports a
  // blend of its start and end colour rather than either. Settling animations
  // first removes that source of noise without weakening the assertion: the
  // colours that matter are the ones the element comes to rest at.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
    }`,
  });
  await page.waitForTimeout(500);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  // Report every rule and node, not just a count — a bare number is not
  // something anyone can act on.
  return violations
    .map((v) =>
      `${v.id} (${v.impact}) — ${v.help}\n` +
      v.nodes
        .slice(0, 4)
        .map((n) => `    ${n.target.join(" ")}\n    ${n.failureSummary?.split("\n").join(" ")}`)
        .join("\n"),
    )
    .join("\n\n");
}

const STATIC_PAGES: [name: string, path: string][] = [
  ["trades", "/trades"],
  ["study", "/study"],
  ["reviews", "/reviews"],
  ["library", "/library"],
  ["settings", "/settings"],
];

const DAY_PAGES: [name: string, suffix: string][] = [
  ["day cockpit", ""],
  ["brief", "/brief"],
  ["companion", "/brief/companion"],
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const [name, path] of STATIC_PAGES) {
      test(`${name} has no accessibility violations`, async ({ page }) => {
        const report = await violationsOn(page, path);
        expect(report, report || "clean").toBe("");
      });
    }

    for (const [name, suffix] of DAY_PAGES) {
      test(`${name} has no accessibility violations`, async ({ page }) => {
        const day = await populatedDay(page);
        const report = await violationsOn(page, `/day/${day}${suffix}`);
        expect(report, report || "clean").toBe("");
      });
    }
  });
}
