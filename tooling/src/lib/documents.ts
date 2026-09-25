import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { parse } from "yaml";

export const DOCUMENT_EXTENSIONS = [".yaml", ".yml", ".json"];

/** Reads a YAML 1.2 or JSON document. Duplicate keys are errors. */
export function readDocument(path: string): unknown {
  const text = readFileSync(path, "utf8");
  if (extname(path) === ".json") return JSON.parse(text);
  return parse(text, { uniqueKeys: true, strict: true, prettyErrors: true });
}

/** Lists files under `dir` recursively, sorted by path, filtered by extension. */
export function listFiles(dir: string, extensions: string[] = DOCUMENT_EXTENSIONS): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (extensions.includes(extname(name))) out.push(path);
    }
  };
  walk(dir);
  return out;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
