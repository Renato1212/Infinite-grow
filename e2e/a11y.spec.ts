import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * §7's quality floor, checked rather than asserted: contrast, names, roles and
 * structure on every screen, in both themes.
 *
 * Needs a running app with seeded data. Colour-contrast is included on purpose —
 * it is the rule a hand-tuned palette breaks most easily.
 */
const PAGES: [name: string, path: string][] = [
  ["day cockpit", "/day/2026-08-27"],
  ["brief", "/day/2026-08-27/brief"],
  ["companion", "/day/2026-08-27/brief/companion"],
  ["trades", "/trades"],
  ["study", "/study"],
  ["reviews", "/reviews"],
  ["library", "/library"],
  ["settings", "/settings"],
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    for (const [name, path] of PAGES) {
      test(`${name} has no accessibility violations`, async ({ page }) => {
        await page.goto(path, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);

        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        // Report every rule and node, not just a count — a bare number is not
        // something anyone can act on.
        const report = violations.map((v) =>
          `${v.id} (${v.impact}) — ${v.help}\n` +
          v.nodes.slice(0, 4).map((n) => `    ${n.target.join(" ")}\n    ${n.failureSummary?.split("\n").join(" ")}`).join("\n"),
        ).join("\n\n");

        expect(report, report || "clean").toBe("");
      });
    }
  });
}
