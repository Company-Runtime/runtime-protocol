import { createHash } from "node:crypto";

/**
 * JSON Canonicalization Scheme (RFC 8785). Numbers use the ECMAScript
 * shortest round-trip form, strings the JSON escaping of ECMA-262, and object
 * keys are sorted by UTF-16 code units — exactly what RFC 8785 specifies.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite numbers cannot be canonicalized");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  throw new TypeError(`cannot canonicalize ${typeof value}`);
}

/** `sha256:<hex>` digest of the canonical form of `value`. */
export function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;
}

/** Digest of a document with the given top-level field removed. */
export function digestWithout(document: Record<string, unknown>, field: string): string {
  const { [field]: _omitted, ...rest } = document;
  return digest(rest);
}
