import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { listFiles, readDocument, isRecord } from "./lib/documents.ts";
import { Report } from "./lib/findings.ts";
import { fromRoot } from "./lib/paths.ts";
import { loadSchemas, type SchemaSet } from "./lib/schemas.ts";
import { loadRegistry } from "./lib/registry.ts";
import { validateRequest } from "./lib/request.ts";
import { manifestErrors, validateManifest } from "./lib/manifest.ts";
import { applyOverlay, type RegistryOverlay } from "./lib/overlay.ts";
import { mergePatch } from "./lib/patch.ts";

export const CONFORMANCE_DIR = fromRoot("conformance");
const CASE_SCHEMA = "urn:runtime-protocol:conformance:0.1:case";
const PROVIDER_SCHEMA = "urn:runtime-protocol:conformance:0.1:provider-fixture";

interface Case {
  id: string;
  title: string;
  category: string;
  level: "document" | "runtime";
  kind: string;
  given?: { overlays?: string[]; providers?: string[]; authority?: string; policy?: string };
  document_type?: string;
  document?: unknown;
  request?: unknown;
  transitions?: Array<{ from: string; to: string; valid: boolean }>;
  then?: Array<Record<string, unknown>>;
  expect: {
    valid?: boolean;
    error?: { code: string; detail?: string };
    warnings?: string[];
    capability?: { id?: string; requested_as?: string };
  };
}

/** Resolves a case source: a path, `{ $base, $patch }`, or an inline document. */
export function resolveSource(source: unknown): unknown {
  if (typeof source === "string") return readDocument(join(CONFORMANCE_DIR, source));
  if (isRecord(source) && typeof source["$base"] === "string") {
    const base = readDocument(join(CONFORMANCE_DIR, source["$base"]));
    return source["$patch"] === undefined ? base : mergePatch(base, source["$patch"]);
  }
  return source;
}

function sourcePaths(source: unknown): string[] {
  if (typeof source === "string") return [source];
  if (isRecord(source) && typeof source["$base"] === "string") return [source["$base"]];
  return [];
}

/** The allowed transitions, read from the normative table in spec/0.1/execution.md. */
export function specTransitions(): Map<string, Set<string>> {
  const text = readFileSync(fromRoot("spec", "0.1", "execution.md"), "utf8");
  const start = text.indexOf("Allowed transitions");
  const table = text.slice(start).split("\n\n")[1] ?? "";
  const out = new Map<string, Set<string>>();
  for (const line of table.split("\n").slice(2)) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    const from = cells[0]!.replace(/`/g, "");
    out.set(from, new Set([...cells[1]!.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!)));
  }
  return out;
}

function runDocumentCase(testCase: Case, schemas: SchemaSet, report: Report, file: string): void {
  const registry = loadRegistry();
  for (const overlay of testCase.given?.overlays ?? []) {
    const errors = applyOverlay(
      registry,
      readDocument(join(CONFORMANCE_DIR, overlay)) as RegistryOverlay,
      overlay,
    );
    if (errors.length > 0)
      report.error(
        "CONF_FIXTURE",
        file,
        `${testCase.id}: overlay ${overlay} is invalid: ${errors[0]}`,
      );
  }
  const fail = (message: string) => report.error("CONF_CASE", file, `${testCase.id}: ${message}`);
  if (testCase.kind === "request") {
    const result = validateRequest(resolveSource(testCase.request), registry, schemas);
    const { expect } = testCase;
    if (expect.valid !== undefined && result.ok !== expect.valid)
      fail(
        `expected valid=${expect.valid}, got ${result.ok} (${result.error?.code}/${result.error?.detail})`,
      );
    if (expect.error) {
      if (result.ok) fail(`expected ${expect.error.code}, request was valid`);
      else if (
        result.error!.code !== expect.error.code ||
        (expect.error.detail && result.error!.detail !== expect.error.detail)
      )
        fail(
          `expected ${expect.error.code}/${expect.error.detail ?? "*"}, got ${result.error!.code}/${result.error!.detail}`,
        );
    }
    for (const warning of expect.warnings ?? [])
      if (!result.warnings.some((w) => w.code === warning)) fail(`expected warning ${warning}`);
    if (expect.capability?.id && result.capability?.id !== expect.capability.id)
      fail(`expected capability ${expect.capability.id}`);
    if (
      expect.capability?.requested_as &&
      result.capability?.requested_as !== expect.capability.requested_as
    )
      fail(`expected requested_as ${expect.capability.requested_as}`);
    return;
  }
  if (testCase.kind === "document") {
    const document = resolveSource(testCase.document);
    const type = testCase.document_type!;
    let problems = schemas.names.includes(type)
      ? schemas.validate(type, document)
      : [`unknown document type ${type}`];
    if (problems.length === 0 && type === "provider-manifest")
      problems = manifestErrors(validateManifest(document, registry, schemas)).map(
        (f) => f.message,
      );
    if (problems.length === 0 && type === "registry-overlay")
      problems = applyOverlay(loadRegistry(), document as RegistryOverlay, "case");
    if (problems.length === 0 && type === "capability-request") {
      const result = validateRequest(document, registry, schemas);
      if (!result.ok) problems = [result.error!.message];
    }
    const valid = problems.length === 0;
    if (testCase.expect.valid !== undefined && valid !== testCase.expect.valid)
      fail(
        `expected valid=${testCase.expect.valid}, got ${valid}${problems[0] ? ` (${problems[0]})` : ""}`,
      );
  }
}

export function validateConformance(schemas: SchemaSet = loadSchemas()): {
  report: Report;
  summary: string;
} {
  const report = new Report();
  for (const file of listFiles(join(CONFORMANCE_DIR, "schemas"), [".json"]))
    schemas.ajv.addSchema(readDocument(file) as object);

  const suiteFile = join(CONFORMANCE_DIR, "suite.yaml");
  const suite = readDocument(suiteFile) as { files: string[]; required_categories: string[] };
  const present = listFiles(join(CONFORMANCE_DIR, "cases")).map((f) =>
    relative(CONFORMANCE_DIR, f),
  );
  for (const file of present)
    if (!suite.files.includes(file)) report.error("CONF_SUITE", suiteFile, `${file} is not listed`);
  for (const file of suite.files)
    if (!present.includes(file)) report.error("CONF_SUITE", suiteFile, `${file} does not exist`);

  // Fixtures are valid documents.
  const fixtures = (dir: string) => listFiles(join(CONFORMANCE_DIR, "fixtures", dir));
  const registry = loadRegistry();
  for (const file of fixtures("providers")) {
    const fixture = readDocument(file) as { manifest: unknown };
    for (const message of schemas.validate(PROVIDER_SCHEMA, fixture))
      report.error("CONF_FIXTURE", file, message);
    for (const finding of manifestErrors(validateManifest(fixture.manifest, registry, schemas)))
      report.error("CONF_FIXTURE", file, `${finding.code}: ${finding.message}`);
  }
  const typed: Array<[string, string]> = [
    ["authority", "authority-grants"],
    ["policy", "policy-set"],
    ["overlays", "registry-overlay"],
    ["requests", "capability-request"],
  ];
  for (const [dir, schema] of typed)
    for (const file of fixtures(dir))
      for (const message of schemas.validate(schema, readDocument(file)))
        report.error("CONF_FIXTURE", file, `${schema}: ${message}`);

  const ids = new Set<string>();
  const categories = new Set<string>();
  const transitions = specTransitions();
  let executed = 0;
  let total = 0;
  for (const relativeFile of suite.files) {
    const file = join(CONFORMANCE_DIR, relativeFile);
    if (!existsSync(file)) continue;
    const cases = readDocument(file) as Case[];
    for (const testCase of cases) {
      total++;
      for (const message of schemas.validate(CASE_SCHEMA, testCase))
        report.error("CONF_CASE", file, `${testCase.id ?? "?"}: ${message}`);
      if (ids.has(testCase.id)) report.error("CONF_CASE", file, `duplicate id ${testCase.id}`);
      ids.add(testCase.id);
      categories.add(testCase.category);
      const referenced = [
        ...(testCase.given?.overlays ?? []),
        ...(testCase.given?.providers ?? []),
        ...(testCase.given?.authority ? [testCase.given.authority] : []),
        ...(testCase.given?.policy ? [testCase.given.policy] : []),
        ...sourcePaths(testCase.request),
        ...sourcePaths(testCase.document),
        ...(testCase.then ?? []).flatMap((action) => sourcePaths(action["submit"])),
      ];
      for (const path of referenced)
        if (!existsSync(join(CONFORMANCE_DIR, path)))
          report.error("CONF_CASE", file, `${testCase.id}: ${path} does not exist`);
      if (testCase.kind === "state_machine") {
        for (const t of testCase.transitions ?? []) {
          const allowed = transitions.get(t.from)?.has(t.to) ?? false;
          if (allowed !== t.valid)
            report.error(
              "CONF_CASE",
              file,
              `${testCase.id}: ${t.from} → ${t.to} is ${allowed ? "allowed" : "refused"} by spec/0.1/execution.md`,
            );
        }
        executed++;
      }
      if (testCase.level === "document") {
        runDocumentCase(testCase, schemas, report, file);
        executed++;
      }
    }
  }
  for (const category of suite.required_categories)
    if (!categories.has(category))
      report.error("CONF_COVERAGE", suiteFile, `no case covers ${category}`);
  return {
    report,
    summary: `${total} case(s), ${executed} executed here, ${total - executed} for runtimes`,
  };
}
