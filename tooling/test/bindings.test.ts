import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capabilityFromToolName,
  fromCloudEvent,
  toCloudEvent,
  toolName,
} from "../src/lib/bindings.ts";
import { validateBindings } from "../src/validate-bindings.ts";

test("the bindings directory is consistent", () => {
  assert.deepEqual(validateBindings().report.errors, []);
});

test("MCP tool names map reversibly", () => {
  for (const id of [
    "communication.send",
    "reasoning.structured_output_check",
    "vendor.acme-labs.ledger.record",
  ]) {
    assert.equal(capabilityFromToolName(toolName(id)), id);
  }
  assert.equal(toolName("communication.send"), "communication__send");
});

test("CloudEvents mapping is lossless, extensions included", () => {
  const event = {
    protocol: "runtime/0.1",
    id: "evt_9",
    type: "org.acme.machine.overheated",
    source: "runtime://plant-runtime",
    time: "2026-01-01T00:00:00Z",
    subject: { ref: "resource://plant/machine-7", type: "machine" },
    causation: { observation_id: "obs_1" },
    data: { temperature: 92 },
    extensions: { "org.acme": { line: 3, shift: "night" } },
  };
  const cloud = toCloudEvent(event);
  assert.equal(cloud["specversion"], "1.0");
  assert.equal(cloud["observationid"], "obs_1");
  assert.equal(cloud["runtimeextensions"], '{"org.acme":{"line":3,"shift":"night"}}');
  assert.deepEqual(fromCloudEvent(cloud), event);
});
