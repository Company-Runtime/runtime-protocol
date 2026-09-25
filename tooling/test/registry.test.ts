import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRegistry } from "../src/lib/registry.ts";
import { validateRegistry } from "../src/validate-registry.ts";
import { buildGraph } from "../src/graph.ts";

const rules = (registry = loadRegistry()) =>
  validateRegistry(registry).report.errors.map((f) => `${f.rule}: ${f.message}`);

test("the canonical registry is valid", () => {
  assert.deepEqual(rules(), []);
});

test("the starter vocabulary has the expected size", () => {
  const registry = loadRegistry();
  assert.equal(registry.domains.size, 13);
  assert.equal(registry.verbs.size, 31);
  assert.equal(registry.capabilities.size, 36);
  assert.equal(registry.profiles.size, 7);
  assert.equal(registry.traits.size, 10);
});

test("profiles and capabilities must reference each other", () => {
  const registry = loadRegistry();
  registry.capabilities.get("knowledge.search")!.doc.profiles.push("email");
  assert.ok(
    rules(registry).some((r) => r.includes("profile 'email' does not apply to knowledge.search")),
  );
});

test("a claim enabled by a trait requires that trait", () => {
  const registry = loadRegistry();
  const send = registry.capabilities.get("communication.send")!.doc;
  send.traits.optional = send.traits.optional!.filter((t) => t !== "delivery_receipt");
  delete send.traits.input_gates;
  assert.ok(
    rules(registry).some((r) => r.startsWith("REG_CLAIM") && r.includes("delivery_receipt")),
  );
});

test("input gates must name declared traits and real input fields", () => {
  const registry = loadRegistry();
  const send = registry.capabilities.get("communication.send")!.doc;
  send.traits.input_gates = { streaming: ["stream"] };
  const found = rules(registry);
  assert.ok(found.some((r) => r.includes("undeclared trait 'streaming'")));
  assert.ok(found.some((r) => r.includes("gated field 'stream'")));
});

test("recipes cannot use unknown capabilities or forward references", () => {
  const registry = loadRegistry();
  const recipe = registry.recipes.get("employee.onboard")!.doc;
  recipe.steps[0]!.capability = "identity.create";
  recipe.steps[1]!.input = { subject: { $from: "steps.checklist.output.work.ref" } };
  const found = rules(registry);
  assert.ok(found.some((r) => r.includes("unknown capability 'identity.create'")));
  assert.ok(found.some((r) => r.includes("invalid binding")));
});

test("aliases never chain and never shadow capabilities", () => {
  const registry = loadRegistry();
  registry.manifest.doc.aliases = [
    { alias: "communication.deliver", canonical: "communication.send", since: "0.1.0" },
    { alias: "communication.dispatch", canonical: "communication.deliver", since: "0.1.0" },
    { alias: "knowledge.search", canonical: "resource.search", since: "0.1.0" },
  ];
  const found = rules(registry);
  assert.ok(found.some((r) => r.includes("chains to another alias")));
  assert.ok(found.some((r) => r.includes("is a registered capability")));
});

test("the graph is deterministic and links capabilities to their vocabulary", () => {
  const a = buildGraph();
  const b = buildGraph();
  assert.deepEqual(a, b);
  const edges = a.edges.filter((e) => e.from === "capability:communication.send");
  const has = (type: string, to: string) => edges.some((e) => e.type === type && e.to === to);
  assert.ok(has("in_domain", "domain:communication"));
  assert.ok(has("uses_verb", "verb:send"));
  assert.ok(has("supports_profile", "profile:email"));
  assert.ok(has("supports_trait", "trait:delivery_receipt"));
  assert.ok(has("requires_domain", "domain:identity"));
  assert.ok(has("produces_claim", "claim:delivery"));
  assert.ok(has("emits", "event:communication.sent"));
});
