import { canonicalize } from "./canonical.ts";
import { isRecord } from "./documents.ts";

/** mcp/0.1 tool name: every "." becomes "__" (bindings/mcp/README.md §1.3). */
export function toolName(capabilityId: string): string {
  return capabilityId.replaceAll(".", "__");
}

export function capabilityFromToolName(name: string): string {
  return name.replaceAll("__", ".");
}

/** events/0.1: protocol event → CloudEvents 1.0 structured JSON (bindings/events/README.md). */
export function toCloudEvent(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    specversion: "1.0",
    id: event["id"],
    source: event["source"],
    type: event["type"],
    time: event["time"],
  };
  const subject = event["subject"];
  if (isRecord(subject)) {
    out["subject"] = subject["ref"];
    if (subject["type"] !== undefined) out["subjecttype"] = subject["type"];
    if (subject["version"] !== undefined) out["subjectversion"] = subject["version"];
  }
  out["datacontenttype"] = "application/json";
  out["runtimeprotocol"] = event["protocol"];
  const causation = isRecord(event["causation"]) ? event["causation"] : {};
  const attributes: Array<[string, unknown]> = [
    ["executionid", causation["execution_id"]],
    ["requestid", causation["request_id"]],
    ["observationid", causation["observation_id"]],
    ["causationid", causation["event_id"]],
    ["correlationid", event["correlation_id"]],
  ];
  for (const [name, value] of attributes) if (value !== undefined) out[name] = value;
  if (event["extensions"] !== undefined)
    out["runtimeextensions"] = canonicalize(event["extensions"]);
  out["data"] = event["data"];
  return out;
}

/** events/0.1: CloudEvent → protocol event; the inverse of `toCloudEvent`. */
export function fromCloudEvent(cloudEvent: Record<string, unknown>): Record<string, unknown> {
  const event: Record<string, unknown> = {
    protocol: cloudEvent["runtimeprotocol"],
    id: cloudEvent["id"],
    type: cloudEvent["type"],
    source: cloudEvent["source"],
    time: cloudEvent["time"],
  };
  if (cloudEvent["subject"] !== undefined) {
    const subject: Record<string, unknown> = { ref: cloudEvent["subject"] };
    if (cloudEvent["subjecttype"] !== undefined) subject["type"] = cloudEvent["subjecttype"];
    if (cloudEvent["subjectversion"] !== undefined)
      subject["version"] = cloudEvent["subjectversion"];
    event["subject"] = subject;
  }
  const causation: Record<string, unknown> = {};
  const pairs: Array<[string, string]> = [
    ["executionid", "execution_id"],
    ["requestid", "request_id"],
    ["observationid", "observation_id"],
    ["causationid", "event_id"],
  ];
  for (const [attribute, field] of pairs)
    if (cloudEvent[attribute] !== undefined) causation[field] = cloudEvent[attribute];
  if (Object.keys(causation).length > 0) event["causation"] = causation;
  if (cloudEvent["correlationid"] !== undefined)
    event["correlation_id"] = cloudEvent["correlationid"];
  event["data"] = cloudEvent["data"];
  if (typeof cloudEvent["runtimeextensions"] === "string")
    event["extensions"] = JSON.parse(cloudEvent["runtimeextensions"]);
  return event;
}
