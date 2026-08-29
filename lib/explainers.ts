import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Explainers live in content/explainers/*.md so they can be edited without
 * touching code. Read at request time on the server; there are a dozen small
 * files and Next caches the render anyway.
 */
export function explainer(key: string): string | null {
  const path = join(process.cwd(), "content", "explainers", `${key}.md`);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
