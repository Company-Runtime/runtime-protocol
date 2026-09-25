import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, digest } from "../src/lib/canonical.ts";

test("RFC 8785 §3.2.2 sample canonicalizes exactly", () => {
  const input = JSON.parse(
    '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],' +
      '"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",' +
      '"literals":[null,true,false]}',
  );
  assert.equal(
    canonicalize(input),
    '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
      '"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
  );
});

test("object keys sort by UTF-16 code units and undefined members are dropped", () => {
  assert.equal(
    canonicalize({ b: 1, a: undefined, A: [2, { d: null, c: "x" }] }),
    '{"A":[2,{"c":"x","d":null}],"b":1}',
  );
});

test("digest is stable and prefixed", () => {
  const value = { z: 1, a: [true, "é"] };
  assert.equal(digest(value), digest({ a: [true, "é"], z: 1 }));
  assert.match(digest(value), /^sha256:[0-9a-f]{64}$/);
});

test("non-finite numbers are refused", () => {
  assert.throws(() => canonicalize({ n: Number.NaN }), /non-finite/);
});
