import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

/** Repository root, resolved from this file's location (tooling/src/lib). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function fromRoot(...segments: string[]): string {
  return join(ROOT, ...segments);
}

export function rel(path: string): string {
  return relative(ROOT, path) || ".";
}
