import { findSecrets } from "./secrets.ts";
import { parseCapabilityId, shadowsCore } from "./naming.ts";
import { satisfies } from "./semver.ts";
import type { Registry } from "./registry.ts";
import type { SchemaSet } from "./schemas.ts";

export interface ManifestFinding {
  code: string;
  message: string;
  /** Warnings do not invalidate a manifest: the provider registers but cannot be resolved for them. */
  severity?: "warning";
}

interface Implementation {
  capability: string;
  versions: string[];
  profiles?: string[];
  traits?: string[];
  evidence?: { claims?: string[]; types?: string[] };
  reconciliation?: "supported" | "unsupported";
}

/**
 * Semantic validation of a provider manifest against the registry
 * (spec/0.1/providers.md §2). A manifest is valid when no finding is an error;
 * a version range the registry cannot satisfy is only a warning.
 */
export function validateManifest(
  manifest: unknown,
  registry: Registry,
  schemas: SchemaSet,
): ManifestFinding[] {
  const findings: ManifestFinding[] = [];
  for (const message of schemas.validate("provider-manifest", manifest))
    findings.push({ code: "invalid_request", message: `schema: ${message}` });
  if (findings.length > 0) return findings;
  for (const secret of findSecrets(manifest))
    findings.push({
      code: "invalid_request",
      message: `raw secret (${secret.kind}) at ${secret.path}`,
    });
  const doc = manifest as { implements: Implementation[] };
  const coreIds = new Set(
    [...registry.capabilities.keys()].filter((c) => {
      const p = parseCapabilityId(c);
      return !("error" in p) && p.namespace === "core";
    }),
  );
  const seen = new Set<string>();
  for (const implementation of doc.implements) {
    const id = implementation.capability;
    if (seen.has(id))
      findings.push({ code: "invalid_request", message: `${id} is implemented twice` });
    seen.add(id);
    const parsed = parseCapabilityId(id);
    if ("error" in parsed) {
      findings.push({ code: "invalid_request", message: `${id}: ${parsed.error}` });
      continue;
    }
    if (shadowsCore(parsed, coreIds))
      findings.push({
        code: "invalid_request",
        message: `${id} shadows a core capability; implement the core capability instead`,
      });
    const entry = registry.capabilities.get(id);
    if (!entry) {
      findings.push({ code: "unknown_capability", message: `${id} is not registered` });
      continue;
    }
    const capability = entry.doc;
    if (!implementation.versions.some((range) => satisfies(capability.version, range)))
      findings.push({
        code: "unsupported_version",
        message: `${id}: no declared range contains ${capability.version}`,
        severity: "warning",
      });
    for (const profile of implementation.profiles ?? [])
      if (!capability.profiles.includes(profile))
        findings.push({
          code: "unsupported_profile",
          message: `${id} does not accept profile ${profile}`,
        });
    const declared = new Set([
      ...(capability.traits.required ?? []),
      ...(capability.traits.optional ?? []),
    ]);
    for (const trait of implementation.traits ?? [])
      if (!declared.has(trait))
        findings.push({ code: "missing_trait", message: `${id} does not declare trait ${trait}` });
    for (const trait of capability.traits.required ?? [])
      if (!(implementation.traits ?? []).includes(trait))
        findings.push({ code: "missing_trait", message: `${id} requires trait ${trait}` });
    for (const claim of implementation.evidence?.claims ?? [])
      if (!capability.evidence.claims.includes(claim))
        findings.push({ code: "invalid_request", message: `${id} cannot prove claim ${claim}` });
    if (
      capability.effects.mutating &&
      !(implementation.traits ?? []).includes("idempotency") &&
      implementation.reconciliation !== "supported"
    )
      findings.push({
        code: "invalid_request",
        message: `${id} is mutating: declare the idempotency trait or reconciliation: supported`,
      });
  }
  return findings;
}

export const manifestErrors = (findings: ManifestFinding[]) =>
  findings.filter((f) => f.severity !== "warning");
