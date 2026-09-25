import type { Alias, Capability, Domain, Profile, Registry, Trait } from "./registry.ts";
import { parseCapabilityId, shadowsCore } from "./naming.ts";

export interface RegistryOverlay {
  protocol: "runtime/0.1";
  id: string;
  domains?: Domain[];
  capabilities?: Capability[];
  profiles?: Profile[];
  traits?: Trait[];
  aliases?: Alias[];
}

const NAMESPACED_VOCABULARY =
  /^(?:experimental\.[a-z][a-z0-9_]*|(?:community|vendor|org)\.[a-z0-9][a-z0-9-]*\.[a-z][a-z0-9_]*)$/;

/**
 * Applies a registry overlay (spec/0.1/extensions.md). Overlays may only add
 * namespaced definitions and aliases; they never redefine or shadow core
 * identifiers. Returns the isolation violations found; nothing is applied when
 * any exists.
 */
export function applyOverlay(registry: Registry, overlay: RegistryOverlay, file: string): string[] {
  const errors: string[] = [];
  const coreIds = new Set(registry.capabilities.keys());
  for (const domain of overlay.domains ?? []) {
    if (registry.domains.has(domain.id))
      errors.push(`domain '${domain.id}' redefines a core domain`);
  }
  const overlayDomains = new Set((overlay.domains ?? []).map((d) => d.id));
  for (const capability of overlay.capabilities ?? []) {
    const parsed = parseCapabilityId(capability.id);
    if ("error" in parsed) {
      errors.push(`capability '${capability.id}': ${parsed.error}`);
      continue;
    }
    if (parsed.namespace === "core") {
      errors.push(
        `capability '${capability.id}' is a core identifier; overlays add namespaced definitions only`,
      );
      continue;
    }
    if (shadowsCore(parsed, coreIds))
      errors.push(
        `capability '${capability.id}' shadows core capability '${parsed.local.join(".")}'`,
      );
    const [domain] = parsed.local;
    const verb = parsed.local[parsed.local.length - 1];
    if (capability.domain !== domain || capability.verb !== verb)
      errors.push(`capability '${capability.id}': domain and verb must match its local part`);
    if (!registry.domains.has(capability.domain) && !overlayDomains.has(capability.domain))
      errors.push(`capability '${capability.id}': unknown domain '${capability.domain}'`);
    if (!registry.verbs.has(capability.verb))
      errors.push(`capability '${capability.id}': '${capability.verb}' is not a canonical verb`);
  }
  for (const kind of ["profiles", "traits"] as const) {
    for (const definition of overlay[kind] ?? []) {
      if (!NAMESPACED_VOCABULARY.test(definition.id))
        errors.push(`${kind.slice(0, -1)} '${definition.id}' must be namespaced in an overlay`);
    }
  }
  for (const alias of overlay.aliases ?? []) {
    const parsed = parseCapabilityId(alias.alias);
    if ("error" in parsed || parsed.namespace === "core")
      errors.push(`alias '${alias.alias}' must be a namespaced identifier`);
    if (registry.capabilities.has(alias.alias))
      errors.push(`alias '${alias.alias}' shadows a capability`);
  }
  if (errors.length > 0) return errors;

  for (const domain of overlay.domains ?? [])
    registry.domains.set(domain.id, { file, doc: domain });
  for (const capability of overlay.capabilities ?? [])
    registry.capabilities.set(capability.id, { file, doc: capability });
  for (const profile of overlay.profiles ?? [])
    registry.profiles.set(profile.id, { file, doc: profile });
  for (const trait of overlay.traits ?? []) registry.traits.set(trait.id, { file, doc: trait });
  registry.manifest = {
    ...registry.manifest,
    doc: {
      ...registry.manifest.doc,
      aliases: [...(registry.manifest.doc.aliases ?? []), ...(overlay.aliases ?? [])],
    },
  };
  return [];
}
