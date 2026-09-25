import { isRecord } from "./documents.ts";

/** JSON Merge Patch (RFC 7396). */
export function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isRecord(patch)) return structuredClone(patch);
  const out: Record<string, unknown> = isRecord(target) ? structuredClone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = mergePatch(out[key], value);
  }
  return out;
}
