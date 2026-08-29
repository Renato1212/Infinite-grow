import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts", "tests/**/*.test.ts"] },
  resolve: { alias: { "@": resolve(process.cwd()) } },
});
