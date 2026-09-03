import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  // Server actions revalidate and re-render; give assertions room for a round trip.
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3111",
    trace: "retain-on-failure",
    // Use the browser the environment already has, rather than downloading one.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Always the dev server, including in CI: `next start` runs as production,
  // where lib/auth.ts deliberately ignores DEV_USER_ID, and there is no signed-in
  // user without a mail round trip. Weakening that guard to suit the tests would
  // defeat the point of it. The production build is verified by its own CI step
  // and by Vercel on every push.
  //
  // Locally this reuses whatever dev server is already running.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3111",
        url: "http://localhost:3111/login",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
