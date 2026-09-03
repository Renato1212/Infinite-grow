import { test, expect } from "@playwright/test";

/**
 * The full daily loop, as §11 describes it: prepare, plan, log a trade, score
 * it across the five domains, debrief the day.
 *
 * Needs a running app against a migrated database:
 *   npm run db:push && npm run db:seed
 *   DEV_USER_ID=<uuid> npx next dev -p 3111
 *   npm run e2e
 */

/**
 * A fresh future date per run: the loop creates data and there is no "delete the
 * day" action, so reusing one date would make the second run start half-done.
 */
const DATE = new Date(Date.UTC(2029, 0, 1) + (Date.now() % 900) * 86_400_000)
  .toISOString()
  .slice(0, 10);

test.describe.configure({ mode: "serial" });

test("prepare, plan, trade, debrief", async ({ page }) => {
  await page.goto(`/day/${DATE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // ── Prepare ────────────────────────────────────────────────────────────
  const narrative = page.getByPlaceholder("Paste or summarise…").first();
  await narrative.fill("Attention concentrated on the rate path ahead of the release.");
  await narrative.blur();
  await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /^Add ES$/ }).click();
  await expect(page.getByRole("button", { name: /^ES, E-mini S&P 500/ })).toBeVisible();

  await page.getByLabel("Structure").fill("Balanced above value, both sides tested.");
  await page.getByLabel("Structure").blur();

  // A marked level.
  await page.getByLabel("Level type").selectOption({ label: "VAH" });
  await page.getByLabel("Level price").fill("5000.25");
  await page.getByRole("button", { name: "Add level" }).click();
  await expect(page.getByText("5000.25").first()).toBeVisible();

  await page.getByLabel("Expected environment")
    .fill("Two-sided until the release, then range expansion.");
  await page.getByLabel("Expected environment").blur();

  // ── Plan ───────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Add hypothesis" }).click();
  await page.getByLabel("Short name").fill("Rotation back through value");
  await page.getByLabel("Invalidation").fill("Acceptance above the ONH for fifteen minutes.");
  await page.getByRole("button", { name: "Add hypothesis" }).last().click();
  await expect(page.getByRole("heading", { name: "Rotation back through value" })).toBeVisible();

  await page.getByLabel("Planned response — size, entry style, management")
    .fill("Half size at the level, add only on a retest.");
  await page.getByLabel("Planned response — size, entry style, management").blur();

  await page.getByRole("button", { name: "Add opportunity" }).first().click();
  await page.getByLabel("Setup").fill("Failed auction at the ONH");
  await page.getByRole("button", { name: "Add opportunity" }).last().click();
  await expect(page.getByText("Failed auction at the ONH").first()).toBeVisible();

  // ── Trade ──────────────────────────────────────────────────────────────
  await page.getByLabel("Entry", { exact: true }).fill("5000.00");
  await page.getByLabel("Exit", { exact: true }).fill("5002.00");
  await page.getByLabel("In", { exact: true }).fill("14:35");
  await page.getByLabel("Out", { exact: true }).fill("14:52");
  await page.getByRole("button", { name: "Log trade" }).click();

  // 8 ticks on ES at $12.50 with one lot.
  await expect(page.getByText("+$100.00").first()).toBeVisible({ timeout: 10_000 });

  // ── Debrief the trade across the five domains ──────────────────────────
  await page.getByRole("radio", { name: "Make Technicals the primary domain" }).click();
  await page.getByRole("radiogroup", { name: "Technicals alignment" })
    .getByRole("radio", { name: "Support" }).click();
  await page.getByRole("button", { name: "Yes, identically" }).click();

  // ── Debrief the day ────────────────────────────────────────────────────
  await page.getByLabel("Hypothesis versus reality")
    .fill("Played out, two hours later than expected.");
  await page.getByLabel("Hypothesis versus reality").blur();
  await page.getByLabel("Lessons").fill("Wait for the second test.");
  await page.getByLabel("Lessons").blur();
  await page.getByRole("button", { name: "Played out" }).first().click();

  await page.reload();
  await expect(page.getByText("Played out").first()).toBeVisible();
});

test("the brief renders the plan and offers companion mode", async ({ page }) => {
  await page.goto(`/day/${DATE}/brief`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rotation back through value" })).toBeVisible();
  await expect(page.getByText("Acceptance above the ONH for fifteen minutes.")).toBeVisible();

  await page.getByRole("link", { name: "Companion" }).click();
  await expect(page).toHaveURL(/companion$/);
  await expect(page.getByText("Primary hypothesis")).toBeVisible();
});

test("study respects the filter and reports its sample size", async ({ page }) => {
  await page.goto("/study");
  await expect(page.getByRole("heading", { name: "Study" })).toBeVisible();
  await expect(page.getByText("Expectancy and distribution")).toBeVisible();
  await expect(page.getByText(/^n = \d+$/).first()).toBeVisible();

  await page.getByRole("button", { name: /^Plan/ }).first().click();
  await page.getByRole("button", { name: "Improvised" }).first().click();
  await expect(page).toHaveURL(/planned=unplanned/);
  await expect(page.getByText(/trades match/)).toBeVisible();
});
