import { readFileSync } from "node:fs";
import { fromRoot } from "./paths.ts";

export function readTermList(name: string): Set<string> {
  return new Set(
    readFileSync(fromRoot("tooling", "data", name), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

/** Lower-case word tokens; identifiers split on '.', '_' and '-'. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const STOPWORDS = new Set(
  "a an and are as at be by for from in into is it its of on or such than that the their them this to was were which with without".split(
    " ",
  ),
);

export function contentTokens(text: string): Set<string> {
  return new Set(tokens(text).filter((t) => t.length > 2 && !STOPWORDS.has(t)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Whether `needle` (a token sequence) occurs contiguously in `haystack`. */
export function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++)
    if (needle.every((t, j) => haystack[i + j] === t)) return true;
  return false;
}
