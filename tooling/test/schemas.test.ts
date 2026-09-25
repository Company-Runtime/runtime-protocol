import { test } from "node:test";
import assert from "node:assert/strict";
import { readDocument } from "../src/lib/documents.ts";
import { fromRoot } from "../src/lib/paths.ts";
import { loadSchemas } from "../src/lib/schemas.ts";

const schemas = loadSchemas();
const example = (path: string) =>
  structuredClone(readDocument(fromRoot("examples", path))) as Record<string, any>;

test("every schema compiles", () => {
  for (const name of schemas.names) assert.ok(schemas.validator(name), name);
});

test("capability requests are closed documents", () => {
  const request = example("capability-request/communication-send-email.yaml");
  assert.deepEqual(schemas.validate("capability-request", request), []);
  request["api_key"] = "not allowed";
  assert.ok(schemas.validate("capability-request", request).some((m) => m.includes("api_key")));
});

test("requests carry the exact protocol identifier", () => {
  const request = example("capability-request/knowledge-search.yaml");
  request["protocol"] = "runtime/0.2";
  assert.notDeepEqual(schemas.validate("capability-request", request), []);
});

test("credential selectors accept only secret references", () => {
  const request = example("capability-request/communication-send-email.yaml");
  request["credential"] = { ref: "sk-live-1234567890abcdef" };
  assert.notDeepEqual(schemas.validate("capability-request", request), []);
  request["credential"] = { ref: "secret://organization/providers/example-production" };
  assert.deepEqual(schemas.validate("capability-request", request), []);
});

test("version ranges follow the defined grammar only", () => {
  const request = example("capability-request/knowledge-search.yaml");
  for (const ok of ["0.1.0", "^0.1", "^0.1.0", "~0.1.2", "0.1", "1", "*", "1.0.0-rc.1"]) {
    request["capability"].version = ok;
    assert.deepEqual(schemas.validate("capability-request", request), [], ok);
  }
  for (const bad of [">=0.1.0", "^1", "~0.1", "0.1.x", "latest"]) {
    request["capability"].version = bad;
    assert.notDeepEqual(schemas.validate("capability-request", request), [], bad);
  }
});

test("evidence types only support their claims", () => {
  const evidence = example("evidence/artifact-screenshot.yaml");
  assert.deepEqual(schemas.validate("evidence", evidence), []);
  evidence["claims"] = ["execution"];
  assert.notDeepEqual(schemas.validate("evidence", evidence), []);
  evidence["claims"] = ["vendor.example.rendered"];
  assert.deepEqual(schemas.validate("evidence", evidence), []);
});

test("human attestations must be produced by an actor with a statement", () => {
  const evidence = example("evidence/human-attestation-approval.yaml");
  evidence["produced_by"] = { provider: "example-provider" };
  assert.notDeepEqual(schemas.validate("evidence", evidence), []);
});

test("a completed receipt names the provider and dispatch times", () => {
  const receipt = example("execution-receipt/completed.yaml");
  delete receipt["receipt"].provider;
  assert.notDeepEqual(schemas.validate("execution-receipt", receipt), []);
});

test("a rejected receipt was never dispatched and denial implies rejection", () => {
  const receipt = example("execution-receipt/rejected-authority.yaml");
  receipt["receipt"].started_at = "2026-01-01T00:00:00Z";
  assert.notDeepEqual(schemas.validate("execution-receipt", receipt), []);
  const other = example("execution-receipt/rejected-authority.yaml");
  other["receipt"].status = "failed";
  assert.notDeepEqual(schemas.validate("execution-receipt", other), []);
});

test("capability definitions cannot carry policy", () => {
  const definition = {
    id: "communication.send",
    version: "0.1.0",
    status: "experimental",
    domain: "communication",
    verb: "send",
    description: "Deliver information to intended recipients.",
    input: { schema_ref: "./input.schema.json" },
    output: { schema_ref: "./output.schema.json" },
    profiles: [],
    traits: {},
    authority: { required: true },
    evidence: { supported: true, claims: ["execution"] },
    risk: { default: "low" },
    effects: { mutating: true },
    emits: ["communication.sent"],
  };
  assert.deepEqual(schemas.validate("capability", definition), []);
  assert.notDeepEqual(schemas.validate("capability", { ...definition, approval: "required" }), []);
  assert.notDeepEqual(
    schemas.validate("capability", { ...definition, evidence: { supported: false, claims: [] } }),
    [],
    "mutating capabilities must support execution evidence",
  );
});

test("provider-scoped policy rules cannot require approval", () => {
  const policy = example("policy-set/company-default.yaml");
  assert.deepEqual(schemas.validate("policy-set", policy), []);
  policy["rules"][1].effect = "require_approval";
  assert.notDeepEqual(schemas.validate("policy-set", policy), []);
});

test("an allow decision names the matching grant", () => {
  const decision = example("authority-decision/allow.yaml");
  delete decision["grant_id"];
  assert.notDeepEqual(schemas.validate("authority-decision", decision), []);
});
