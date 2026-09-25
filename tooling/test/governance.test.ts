import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRegistry, type Capability } from "../src/lib/registry.ts";
import { semanticLint } from "../src/semantic-lint.ts";
import { classify, compareRegistries } from "../src/compat.ts";
import { docsCheck, slug } from "../src/docs-check.ts";
import { fromRoot } from "../src/lib/paths.ts";

const lint = (
  extensions: Array<{ file: string; doc: Capability }> = [],
  registry = loadRegistry(),
) => semanticLint({ registry, extensions });
const rulesOf = (report: ReturnType<typeof lint>) =>
  report.findings.map((f) => `${f.rule}: ${f.message}`);

function extension(
  id: string,
  overrides: Partial<Capability> = {},
  dir = "experimental",
): { file: string; doc: Capability } {
  const base = structuredClone(loadRegistry().capabilities.get("communication.send")!.doc);
  const parts = id.split(".");
  const local = parts[0] === "experimental" ? parts.slice(1) : parts.slice(2);
  return {
    file: fromRoot("extensions", dir, id, "capability.yaml"),
    doc: {
      ...base,
      id,
      domain: local[0]!,
      verb: local[local.length - 1]!,
      input: { schema: { type: "object" } },
      output: { schema: { type: "object" } },
      rfc: undefined,
      ...overrides,
    } as Capability,
  };
}

test("the canonical registry passes the semantic lint with no findings", () => {
  assert.deepEqual(rulesOf(lint()), []);
});

test("rejected synonyms, unknown verbs and specialization are errors", () => {
  const found = rulesOf(
    lint([
      extension("experimental.execution.run"),
      extension("experimental.communication.shout"),
      extension("experimental.communication.email.send"),
      extension("experimental.communication.send_with_attachments"),
    ]),
  );
  assert.ok(
    found.some(
      (r) => r.startsWith("SL004") && r.includes("'run' is a rejected synonym of 'execute'"),
    ),
  );
  assert.ok(found.some((r) => r.startsWith("SL003") && r.includes("'shout'")));
  assert.ok(found.some((r) => r.startsWith("SL005") && r.includes("communication.email.send")));
  assert.ok(found.some((r) => r.startsWith("SL006") && r.includes("profile 'email'")));
  assert.ok(found.some((r) => r.startsWith("SL007") && r.includes("trait 'attachments'")));
});

test("vendor and transport names are leakage in core and experimental vocabulary", () => {
  const found = rulesOf(
    lint([
      extension("experimental.communication.send_slack", {
        description: "Post a message to a Slack channel.",
      }),
      extension("experimental.event.publish_webhook", {
        description: "Deliver an event through a webhook.",
      }),
    ]),
  );
  assert.ok(found.some((r) => r.startsWith("SL009") && r.includes("'slack'")));
  assert.ok(found.some((r) => r.startsWith("SL019") && r.includes("'webhook'")));
});

test("vendor names are allowed inside the vendor's own namespace", () => {
  const found = rulesOf(
    lint([
      extension(
        "vendor.slack.channel.archive",
        { description: "Archive a Slack channel.", effects: { mutating: true }, emits: [] },
        "vendor/slack",
      ),
    ]),
  );
  assert.ok(!found.some((r) => r.startsWith("SL009")));
});

test("namespace isolation and shadowing", () => {
  const found = rulesOf(
    lint([
      extension("vendor.acme.communication.send", {}, "vendor/acme"),
      extension("community.jane.work.create", {}, "vendor/acme"),
    ]),
  );
  assert.ok(
    found.some(
      (r) => r.startsWith("SL012") && r.includes("shadows core capability communication.send"),
    ),
  );
  assert.ok(
    found.some(
      (r) => r.startsWith("SL012") && r.includes("does not belong to this extension directory"),
    ),
  );
});

test("new vocabulary needs a proposal and starts experimental", () => {
  const found = rulesOf(lint([extension("experimental.work.claim", { status: "candidate" })]));
  assert.ok(found.some((r) => r.startsWith("SL013")));
  assert.ok(found.some((r) => r.startsWith("SL017")));
});

test("effects, evidence and events must agree with the verb", () => {
  const registry = loadRegistry();
  const search = registry.capabilities.get("knowledge.search")!.doc;
  search.effects = { mutating: true };
  const found = rulesOf(lint([], registry));
  assert.ok(found.some((r) => r.startsWith("SL015")));
  assert.ok(found.some((r) => r.startsWith("SL016")));
});

test("overlapping intents need human review", () => {
  const found = rulesOf(
    lint([
      extension("experimental.communication.send_later", {
        description: "Deliver information to intended recipients.",
      }),
    ]),
  );
  assert.ok(found.some((r) => r.startsWith("SL008")));
});

test("compatibility: schema changes are classified from the caller's side", () => {
  const base = {
    type: "object",
    required: ["a"],
    properties: { a: { type: "string", maxLength: 10 }, b: { enum: ["x", "y"] } },
  };
  const req = structuredClone(base);
  req.required.push("b");
  assert.equal(classify(base, req, "input"), "breaking");
  assert.equal(classify(base, req, "output"), "compatible");
  const shorter = structuredClone(base);
  shorter.properties.a.maxLength = 5;
  assert.equal(classify(base, shorter, "input"), "breaking");
  const more = structuredClone(base) as any;
  more.properties.b.enum = ["x", "y", "z"];
  assert.equal(classify(base, more, "input"), "compatible");
  assert.equal(classify(base, more, "output"), "breaking");
  const described = structuredClone(base) as any;
  described.description = "editorial";
  assert.equal(classify(base, described, "input"), "compatible");
});

test("compatibility: breaking changes need a version bump, removals need deprecation", () => {
  const base = loadRegistry();
  const head = loadRegistry();
  head.capabilities.get("communication.send")!.doc.profiles = ["chat"];
  head.capabilities.delete("knowledge.validate");
  head.capabilities.get("work.start")!.doc.status = "experimental";
  const found = compareRegistries(base, head).findings.map((f) => f.rule);
  assert.deepEqual([...new Set(found)].sort(), ["CC001", "CC002"]);
  head.capabilities.get("communication.send")!.doc.version = "0.2.0";
  assert.ok(
    !compareRegistries(base, head).findings.some((f) => f.message.includes("communication.send")),
  );
});

test("docs: anchors and normative tables are consistent", () => {
  assert.equal(slug("5. RFC process"), "5-rfc-process");
  assert.equal(slug("`communication.send` flow"), "communicationsend-flow");
  assert.deepEqual(docsCheck().report.errors, []);
});
