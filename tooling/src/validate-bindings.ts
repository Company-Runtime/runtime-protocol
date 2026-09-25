import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { listFiles, readDocument, isRecord } from "./lib/documents.ts";
import { Report } from "./lib/findings.ts";
import { fromRoot } from "./lib/paths.ts";
import { loadSchemas, type SchemaSet } from "./lib/schemas.ts";
import { loadRegistry, type Registry } from "./lib/registry.ts";
import { capabilityFromToolName, fromCloudEvent, toCloudEvent, toolName } from "./lib/bindings.ts";

const BINDINGS = ["http", "mcp", "events"];

function refs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) refs(item, out);
  else if (isRecord(value))
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string") out.push(item);
      else refs(item, out);
    }
  return out;
}

function resolvePointer(document: unknown, pointer: string): unknown {
  let node = document;
  for (const raw of pointer.replace(/^#\/?/, "").split("/").filter(Boolean)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return node;
}

export function validateBindings(
  schemas: SchemaSet = loadSchemas(),
  registry: Registry = loadRegistry(),
): { report: Report; count: number } {
  const report = new Report();
  let count = 0;
  for (const name of BINDINGS) {
    const readme = fromRoot("bindings", name, "README.md");
    if (!existsSync(readme))
      report.error("BINDING_DOC", readme, "binding specification is missing");
  }

  // HTTP: the OpenAPI contract references only existing protocol schemas.
  const openapiFile = fromRoot("bindings", "http", "openapi.yaml");
  const openapi = readDocument(openapiFile);
  count++;
  if (
    !isRecord(openapi) ||
    typeof openapi["openapi"] !== "string" ||
    !openapi["openapi"].startsWith("3.1")
  )
    report.error("BINDING_OPENAPI", openapiFile, "must be an OpenAPI 3.1 document");
  for (const ref of refs(openapi)) {
    if (ref.startsWith("#")) {
      if (resolvePointer(openapi, ref) === undefined)
        report.error("BINDING_OPENAPI", openapiFile, `unresolved local reference ${ref}`);
    } else {
      const [id, fragment] = ref.split("#");
      const target = schemas.ajv.getSchema(id ?? "")?.schema;
      if (!target || (fragment && resolvePointer(target, fragment) === undefined))
        report.error("BINDING_OPENAPI", openapiFile, `unresolved schema reference ${ref}`);
    }
  }

  // Binding-local schemas and their examples.
  const bindingSchemas: Record<string, string> = {
    mcp: "urn:runtime-protocol:bindings:mcp:0.1:tool",
    events: "urn:runtime-protocol:bindings:events:0.1:cloudevent",
  };
  for (const file of listFiles(fromRoot("bindings"), [".json"]).filter((f) =>
    f.endsWith(".schema.json"),
  )) {
    try {
      schemas.ajv.addSchema(readDocument(file) as object);
    } catch (error) {
      report.error("BINDING_SCHEMA", file, (error as Error).message);
    }
  }
  for (const [name, id] of Object.entries(bindingSchemas)) {
    for (const file of listFiles(fromRoot("bindings", name, "examples"))) {
      count++;
      for (const message of schemas.validate(id, readDocument(file)))
        report.error("BINDING_EXAMPLE", file, message);
    }
  }

  // MCP: tool names map reversibly for every registered capability.
  for (const id of registry.capabilities.keys()) {
    if (capabilityFromToolName(toolName(id)) !== id)
      report.error(
        "BINDING_MCP_NAME",
        registry.capabilities.get(id)!.file,
        `tool name of ${id} is not reversible`,
      );
  }

  // Events: the example CloudEvent is exactly the mapping of the example event, and back.
  const eventFile = fromRoot("examples", "event", "communication-sent.yaml");
  const cloudFile = fromRoot(
    "bindings",
    "events",
    "examples",
    "communication-sent.cloudevent.json",
  );
  const event = readDocument(eventFile) as Record<string, unknown>;
  const cloud = readDocument(cloudFile) as Record<string, unknown>;
  if (!isDeepStrictEqual(toCloudEvent(event), cloud))
    report.error(
      "BINDING_EVENTS",
      cloudFile,
      "is not the events/0.1 mapping of examples/event/communication-sent.yaml",
    );
  if (!isDeepStrictEqual(fromCloudEvent(cloud), event))
    report.error("BINDING_EVENTS", cloudFile, "does not map back losslessly");
  return { report, count };
}
