import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, parseVersion, satisfies, isValidRange } from "../src/lib/semver.ts";

test("ranges follow spec/0.1/versioning.md", () => {
  const cases: Array<[string, string, boolean]> = [
    ["0.1.0", "^0.1", true],
    ["0.1.9", "^0.1", true],
    ["0.2.0", "^0.1", false],
    ["0.1.0", "^0.1.1", false],
    ["1.4.0", "^1.2.0", true],
    ["2.0.0", "^1.2.0", false],
    ["0.0.3", "^0.0.3", true],
    ["0.0.4", "^0.0.3", false],
    ["0.1.2", "~0.1.2", true],
    ["0.1.7", "~0.1.2", true],
    ["0.2.0", "~0.1.2", false],
    ["0.1.5", "0.1", true],
    ["0.2.0", "0.1", false],
    ["1.9.9", "1", true],
    ["2.0.0", "1", false],
    ["0.1.0", "0.1.0", true],
    ["0.1.1", "0.1.0", false],
    ["3.1.4", "*", true],
    ["0.1.0-rc.1", "*", false],
    ["0.1.0-rc.1", "^0.1", false],
    ["0.1.0-rc.2", "^0.1.0-rc.1", true],
    ["0.1.0", "^0.1.0-rc.1", true],
  ];
  for (const [version, range, expected] of cases)
    assert.equal(satisfies(version, range), expected, `${version} ${range}`);
});

test("only the defined range grammar is accepted", () => {
  for (const ok of ["*", "1", "0.1", "^0.1", "^0.1.0", "~0.1.2", "0.1.0", "1.0.0-rc.1"])
    assert.ok(isValidRange(ok), ok);
  for (const bad of [">=0.1.0", "^1", "~0.1", "0.1.x", "latest", ""])
    assert.ok(!isValidRange(bad), bad);
});

test("semantic version precedence", () => {
  const order = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];
  for (let i = 1; i < order.length; i++)
    assert.ok(
      compareVersions(parseVersion(order[i - 1]!)!, parseVersion(order[i]!)!) < 0,
      `${order[i - 1]} < ${order[i]}`,
    );
});
