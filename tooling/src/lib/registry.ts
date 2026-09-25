import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { listFiles, readDocument, isRecord } from "./documents.ts";
import { fromRoot } from "./paths.ts";

export const REGISTRY_DIR = fromRoot("registry");
export const RECIPES_DIR = fromRoot("recipes");
export const NAMESPACES = ["core", "experimental", "community", "vendor", "org"] as const;
export const CORE_CLAIMS = ["execution", "delivery", "state", "approval"] as const;

export interface Entry<T = Record<string, unknown>> {
  file: string;
  doc: T;
}

export interface Domain {
  id: string;
  definition: string;
  excludes: string[];
  status: string;
}
export interface Verb {
  id: string;
  definition: string;
  past_tense: string;
  mutating: boolean | "varies";
  rejected_synonyms: string[];
  status: string;
}
export interface Trait {
  id: string;
  definition: string;
  enables_claims?: string[];
  status: string;
}
export interface Profile {
  id: string;
  definition: string;
  status: string;
  applies_to: Array<{ capability: string; input?: { schema_ref?: string; schema?: object } }>;
  excludes?: string[];
}
export interface Capability {
  id: string;
  version: string;
  status: string;
  domain: string;
  verb: string;
  description: string;
  object_justification?: string;
  input: { schema_ref?: string; schema?: object };
  output: { schema_ref?: string; schema?: object };
  profiles: string[];
  traits: { required?: string[]; optional?: string[]; input_gates?: Record<string, string[]> };
  evidence: { supported: boolean; claims: string[] };
  risk: { default: string };
  effects: { mutating: boolean };
  emits: string[];
  relations?: { requires?: string[]; related?: string[] };
  deprecation?: { replaced_by: string; since: string };
  proposal_ref?: string;
  rfc?: string;
}
export interface Alias {
  alias: string;
  canonical: string;
  since: string;
}
export interface Recipe {
  id: string;
  steps: Array<{
    id: string;
    capability: string;
    profile?: string;
    input: unknown;
    traits?: { required?: string[] };
  }>;
  inputs?: { properties?: Record<string, unknown> };
}

export interface Registry {
  manifest: Entry<{ version: string; aliases: Alias[] }>;
  domains: Map<string, Entry<Domain>>;
  verbs: Map<string, Entry<Verb>>;
  traits: Map<string, Entry<Trait>>;
  profiles: Map<string, Entry<Profile>>;
  capabilities: Map<string, Entry<Capability>>;
  recipes: Map<string, Entry<Recipe>>;
  /** Every file that failed to parse, with the error. */
  parseErrors: Array<{ file: string; message: string }>;
}

function load<T>(files: string[], parseErrors: Registry["parseErrors"]): Map<string, Entry<T>> {
  const out = new Map<string, Entry<T>>();
  for (const file of files) {
    try {
      const doc = readDocument(file);
      const id = isRecord(doc) && typeof doc["id"] === "string" ? doc["id"] : `?${file}`;
      out.set(id, { file, doc: doc as T });
    } catch (error) {
      parseErrors.push({ file, message: (error as Error).message });
    }
  }
  return new Map([...out.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const yamlIn = (dir: string) => listFiles(dir, [".yaml", ".yml"]);

/** Loads the registry rooted at `root` (defaults to this repository's registry/). */
export function loadRegistry(
  root: string = REGISTRY_DIR,
  recipesRoot: string = RECIPES_DIR,
): Registry {
  const parseErrors: Registry["parseErrors"] = [];
  const manifestFile = join(root, "registry.yaml");
  let manifest: Registry["manifest"] = { file: manifestFile, doc: { version: "0.0", aliases: [] } };
  try {
    manifest = {
      file: manifestFile,
      doc: readDocument(manifestFile) as Registry["manifest"]["doc"],
    };
  } catch (error) {
    parseErrors.push({ file: manifestFile, message: (error as Error).message });
  }
  return {
    manifest,
    domains: load<Domain>(yamlIn(join(root, "domains")), parseErrors),
    verbs: load<Verb>(yamlIn(join(root, "verbs")), parseErrors),
    traits: load<Trait>(yamlIn(join(root, "traits")), parseErrors),
    profiles: load<Profile>(
      yamlIn(join(root, "profiles")).filter((f) => basename(f) === "profile.yaml"),
      parseErrors,
    ),
    capabilities: load<Capability>(
      yamlIn(join(root, "capabilities")).filter((f) => basename(f) === "capability.yaml"),
      parseErrors,
    ),
    recipes: load<Recipe>(yamlIn(recipesRoot), parseErrors),
    parseErrors,
  };
}

/** Resolves a definition's `schema_ref` relative to the definition file. */
export function schemaPath(
  definitionFile: string,
  source: { schema_ref?: string },
): string | undefined {
  if (!source.schema_ref) return undefined;
  const path = join(dirname(definitionFile), source.schema_ref);
  return existsSync(path) ? path : undefined;
}

export function namespaceOf(id: string): string {
  const first = id.split(".")[0] ?? "";
  return (NAMESPACES as readonly string[]).includes(first) ? first : "core";
}

/** Traits that enable a claim, according to the registry. */
export function traitsEnabling(registry: Registry, claim: string): string[] {
  return [...registry.traits.values()]
    .filter((t) => (t.doc.enables_claims ?? []).includes(claim))
    .map((t) => t.doc.id);
}
