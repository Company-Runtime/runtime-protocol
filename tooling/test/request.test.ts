import { test } from "node:test";
import assert from "node:assert/strict";
import { readDocument } from "../src/lib/documents.ts";
import { fromRoot } from "../src/lib/paths.ts";
import { loadRegistry } from "../src/lib/registry.ts";
import { loadSchemas } from "../src/lib/schemas.ts";
import { validateRequest } from "../src/lib/request.ts";
import { validateManifest } from "../src/lib/manifest.ts";
import { applyOverlay, type RegistryOverlay } from "../src/lib/overlay.ts";

const schemas = loadSchemas();
const registry = loadRegistry();
const email = () =>
  structuredClone(
    readDocument(fromRoot("examples/capability-request/communication-send-email.yaml")),
  ) as Record<string, any>;
const check = (request: unknown, reg = registry) => validateRequest(request, reg, schemas);
const code = (request: unknown, reg = registry) => {
  const r = check(request, reg);
  return r.ok ? "ok" : `${r.error!.code}/${r.error!.detail}`;
};

test("the smoke request is valid and computes effective traits and claims", () => {
  const result = check(email());
  assert.equal(result.ok, true);
  assert.deepEqual(result.capability, { id: "communication.send", version: "0.1.0" });
  assert.deepEqual(result.effectiveTraits, ["delivery_receipt"]);
  assert.deepEqual(result.requiredClaims, ["delivery", "execution"]);
});

test("step 1: oversized and deeply nested requests", () => {
  const big = email();
  big.input.content = "x".repeat(1024 * 1024);
  assert.equal(code(big), "invalid_request/payload_too_large");
  const deep = email();
  let node: Record<string, unknown> = deep.input;
  for (let i = 0; i < 40; i++) node = (node["n"] = {}) as Record<string, unknown>;
  assert.equal(code(deep), "invalid_request/payload_too_deep");
});

test("step 2: unsupported protocol", () => {
  assert.equal(
    code({ ...email(), protocol: "runtime/9.9" }),
    "unsupported_version/unsupported_protocol",
  );
});

test("step 3: schema", () => {
  const r = email();
  delete r.actor;
  assert.equal(code(r), "invalid_request/schema_invalid");
});

test("step 4: raw secrets and credential owner mismatch", () => {
  const r = email();
  r.input.content = "sk-" + "z".repeat(30);
  assert.equal(code(r), "invalid_request/raw_secret");
  const m = email();
  m.credential = { ref: "secret://runtime/providers/example", owner: "organization" };
  assert.equal(code(m), "invalid_request/credential_owner_mismatch");
});

test("step 5: canonical naming and namespace isolation", () => {
  for (const [id, detail] of [
    ["core.communication.send", "invalid_capability_id"],
    ["org.communication.send", "invalid_capability_id"],
    ["vendor.acme.communication.send", "namespace_violation"],
    ["experimental.communication.send", "namespace_violation"],
  ] as const) {
    const r = email();
    r.capability.id = id;
    assert.equal(code(r), `invalid_request/${detail}`, id);
  }
});

test("step 6: unknown capabilities, including rejected synonyms", () => {
  for (const id of ["communication.deliver", "execution.run", "identity.create"]) {
    const r = email();
    r.capability.id = id;
    assert.equal(code(r), "unknown_capability/not_registered", id);
  }
});

test("step 6: deprecated aliases are normalized with a warning", () => {
  const reg = loadRegistry();
  const overlay: RegistryOverlay = {
    protocol: "runtime/0.1",
    id: "acme-aliases",
    aliases: [
      { alias: "org.acme.message.dispatch", canonical: "communication.send", since: "0.1.0" },
    ],
  };
  assert.deepEqual(applyOverlay(reg, overlay, "overlay.yaml"), []);
  const r = email();
  r.capability.id = "org.acme.message.dispatch";
  const result = check(r, reg);
  assert.equal(result.ok, true);
  assert.deepEqual(result.capability, {
    id: "communication.send",
    version: "0.1.0",
    requested_as: "org.acme.message.dispatch",
  });
  assert.equal(result.warnings[0]!.code, "deprecated_alias");
});

test("step 7: version mismatch", () => {
  const r = email();
  r.capability.version = "^1.0.0";
  assert.equal(code(r), "unsupported_version/no_matching_version");
});

test("step 8: unknown or unaccepted profiles", () => {
  const r = email();
  r.profile = "fax";
  assert.equal(code(r), "unsupported_profile/unknown_profile");
  const k = structuredClone(
    readDocument(fromRoot("examples/capability-request/knowledge-search.yaml")),
  ) as Record<string, any>;
  k.profile = "email";
  assert.equal(code(k), "unsupported_profile/profile_not_accepted");
});

test("step 9: missing traits, explicit or implied by gated fields", () => {
  const r = email();
  r.traits = { required: ["streaming"] };
  assert.equal(code(r), "missing_trait/trait_not_declared");
  const u = email();
  u.traits = { required: ["teleport"] };
  assert.equal(code(u), "missing_trait/unknown_trait");
  const g = email();
  g.input.thread = "resource://chat/threads/1";
  assert.equal(check(g).ok, true);
  assert.ok(check(g).effectiveTraits.includes("threading"));
});

test("step 10: unsupported evidence claims", () => {
  const k = structuredClone(
    readDocument(fromRoot("examples/capability-request/knowledge-search.yaml")),
  ) as Record<string, any>;
  k.evidence = { require: ["delivery"] };
  assert.equal(code(k), "invalid_request/unsupported_claim");
});

test("step 11: effective input schema includes the profile", () => {
  const r = email();
  delete r.input.subject;
  assert.equal(code(r), "invalid_request/input_invalid");
  r.profile = "chat";
  assert.equal(code(r), "ok");
  const sms = email();
  sms.profile = "sms";
  assert.equal(code(sms), "invalid_request/input_invalid", "sms forbids a subject");
});

test("step 11: request and input resources must agree", () => {
  const read = {
    protocol: "runtime/0.1",
    request_id: "req_r",
    capability: { id: "resource.read", version: "^0.1" },
    actor: { ref: "identity://agent/a" },
    resource: { ref: "resource://crm/accounts/1" },
    input: { resource: "resource://crm/accounts/2" },
  };
  assert.equal(code(read), "invalid_request/resource_mismatch");
  assert.equal(check({ ...read, resource: undefined }).resource, "resource://crm/accounts/2");
});

test("overlays cannot shadow core or add core identifiers", () => {
  const reg = loadRegistry();
  const bad: RegistryOverlay = {
    protocol: "runtime/0.1",
    id: "bad",
    capabilities: [
      { ...reg.capabilities.get("communication.send")!.doc, id: "vendor.acme.communication.send" },
      {
        ...reg.capabilities.get("communication.send")!.doc,
        id: "communication.shout",
        verb: "shout",
      },
    ],
    traits: [
      {
        id: "confetti",
        version: "0.1.0",
        status: "experimental",
        definition: "Adds confetti to messages.",
      },
    ],
  };
  const errors = applyOverlay(reg, bad, "bad.yaml");
  assert.ok(errors.some((e) => e.includes("shadows core capability")));
  assert.ok(errors.some((e) => e.includes("is a core identifier")));
  assert.ok(errors.some((e) => e.includes("must be namespaced")));
});

test("manifests are checked against the registry", () => {
  const manifest = structuredClone(
    readDocument(fromRoot("examples/provider-manifest/example-provider.yaml")),
  ) as Record<string, any>;
  assert.deepEqual(validateManifest(manifest, registry, schemas), []);
  manifest.implements[0].traits = ["attachments", "delivery_receipt"];
  manifest.implements[0].reconciliation = "unsupported";
  manifest.implements[1].profiles = ["email"];
  const codes = validateManifest(manifest, registry, schemas).map((f) => f.code);
  assert.deepEqual(codes, ["invalid_request", "unsupported_profile"]);
});
