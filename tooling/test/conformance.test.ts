import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePatch } from "../src/lib/patch.ts";
import { specTransitions, validateConformance } from "../src/validate-conformance.ts";

test("the conformance suite is valid and its document cases pass", () => {
  const { report } = validateConformance();
  assert.deepEqual(report.errors, []);
});

test("JSON Merge Patch follows RFC 7396", () => {
  assert.deepEqual(mergePatch({ a: "b", c: { d: "e", f: "g" } }, { a: "z", c: { f: null } }), {
    a: "z",
    c: { d: "e" },
  });
  assert.deepEqual(mergePatch({ a: [1, 2] }, { a: [3] }), { a: [3] });
  assert.deepEqual(mergePatch({ a: 1 }, { b: { c: null } }), { a: 1, b: {} });
});

test("the normative transition table is machine-readable", () => {
  const table = specTransitions();
  assert.deepEqual([...table.get("unknown")!].sort(), ["completed", "failed"]);
  assert.ok(!table.has("completed"), "terminal states have no outgoing transitions");
  assert.ok(table.get("running")!.has("unknown"));
});
