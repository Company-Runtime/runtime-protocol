import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { type Registry, loadRegistry, REGISTRY_DIR } from "./lib/registry.ts";

export interface GraphNode {
  id: string;
  kind: "domain" | "verb" | "capability" | "profile" | "trait" | "claim" | "event";
  status?: string;
}
export interface GraphEdge {
  from: string;
  to: string;
  type: string;
}
export interface Graph {
  protocol: "runtime/0.1";
  registry_version: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const GRAPH_FILE = join(REGISTRY_DIR, "graph.json");

/** Builds the registry graph deterministically (sorted nodes and edges). */
export function buildGraph(registry: Registry = loadRegistry()): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const node = (kind: GraphNode["kind"], id: string, status?: string): string => {
    const key = `${kind}:${id}`;
    if (!nodes.has(key)) nodes.set(key, status ? { id: key, kind, status } : { id: key, kind });
    return key;
  };
  const edge = (from: string, to: string, type: string) => edges.push({ from, to, type });
  for (const { doc } of registry.domains.values()) node("domain", doc.id, doc.status);
  for (const { doc } of registry.verbs.values()) node("verb", doc.id, doc.status);
  for (const { doc } of registry.profiles.values()) node("profile", doc.id, doc.status);
  for (const { doc } of registry.traits.values()) {
    const trait = node("trait", doc.id, doc.status);
    for (const claim of doc.enables_claims ?? [])
      edge(trait, node("claim", claim), "enables_claim");
  }
  for (const { doc } of registry.capabilities.values()) {
    const cap = node("capability", doc.id, doc.status);
    edge(cap, node("domain", doc.domain), "in_domain");
    edge(cap, node("verb", doc.verb), "uses_verb");
    for (const p of doc.profiles) edge(cap, node("profile", p), "supports_profile");
    for (const t of doc.traits.required ?? []) edge(cap, node("trait", t), "requires_trait");
    for (const t of doc.traits.optional ?? []) edge(cap, node("trait", t), "supports_trait");
    for (const d of doc.relations?.requires ?? []) edge(cap, node("domain", d), "requires_domain");
    for (const r of doc.relations?.related ?? []) edge(cap, node("capability", r), "related_to");
    for (const c of doc.evidence.claims) edge(cap, node("claim", c), "produces_claim");
    for (const e of doc.emits) edge(cap, node("event", e), "emits");
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    protocol: "runtime/0.1",
    registry_version: registry.manifest.doc.version,
    nodes: [...nodes.values()].sort((a, b) => cmp(a.id, b.id)),
    edges: edges.sort((a, b) => cmp(a.from, b.from) || cmp(a.type, b.type) || cmp(a.to, b.to)),
  };
}

export function renderGraph(graph: Graph): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

/** Writes graph.json, or with `check` reports whether the committed file is current. */
export function syncGraph(check: boolean): number {
  const rendered = renderGraph(buildGraph());
  if (check) {
    const current = existsSync(GRAPH_FILE) ? readFileSync(GRAPH_FILE, "utf8") : "";
    if (current !== rendered) {
      console.log("✗ registry/graph.json is out of date; run pnpm run registry:graph");
      return 1;
    }
    console.log("✓ registry/graph.json is current");
    return 0;
  }
  writeFileSync(GRAPH_FILE, rendered);
  console.log("✓ wrote registry/graph.json");
  return 0;
}
