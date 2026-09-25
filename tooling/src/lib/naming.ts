import { NAMESPACES } from "./registry.ts";

const SEGMENT = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const OWNER = /^[a-z0-9][a-z0-9-]*$/;

export interface ParsedCapabilityId {
  namespace: "core" | "experimental" | "community" | "vendor" | "org";
  owner?: string;
  /** The `<domain>.<verb>` or `<domain>.<object>.<verb>` part. */
  local: string[];
}

/**
 * Parses a capability identifier according to spec/0.1/extensions.md, or returns
 * the reason it is invalid. `core.` is never written.
 */
export function parseCapabilityId(id: string): ParsedCapabilityId | { error: string } {
  const parts = id.split(".");
  const first = parts[0] ?? "";
  if (first === "core")
    return { error: "the core namespace is implicit; 'core.' must not be written" };
  if (first === "experimental") {
    const local = parts.slice(1);
    if (local.length < 2 || local.length > 3 || !local.every((p) => SEGMENT.test(p)))
      return { error: "experimental identifiers are experimental.<domain>[.<object>].<verb>" };
    return { namespace: "experimental", local };
  }
  if (first === "community" || first === "vendor" || first === "org") {
    const owner = parts[1] ?? "";
    const local = parts.slice(2);
    if (!OWNER.test(owner)) return { error: `${first} identifiers need an owner segment` };
    if (local.length < 2 || local.length > 3 || !local.every((p) => SEGMENT.test(p)))
      return { error: `${first} identifiers are ${first}.<owner>.<domain>[.<object>].<verb>` };
    return { namespace: first, owner, local };
  }
  if (parts.length < 2 || parts.length > 3 || !parts.every((p) => SEGMENT.test(p)))
    return { error: "core identifiers are <domain>.<verb> or <domain>.<object>.<verb>" };
  if ((NAMESPACES as readonly string[]).includes(first))
    return { error: `'${first}' is a reserved namespace word` };
  return { namespace: "core", local: parts };
}

/**
 * Namespace isolation: an extension identifier whose local part equals a core
 * capability shadows it and is invalid.
 */
export function shadowsCore(parsed: ParsedCapabilityId, coreIds: Set<string>): boolean {
  return parsed.namespace !== "core" && coreIds.has(parsed.local.join("."));
}
