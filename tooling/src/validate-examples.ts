import { basename, dirname, relative } from "node:path";
import { listFiles, readDocument, isRecord } from "./lib/documents.ts";
import { Report } from "./lib/findings.ts";
import { fromRoot } from "./lib/paths.ts";
import { loadSchemas, type SchemaSet } from "./lib/schemas.ts";
import { digestWithout, digest } from "./lib/canonical.ts";
import { loadRegistry, type Registry } from "./lib/registry.ts";
import { validateRequest } from "./lib/request.ts";
import { manifestErrors, validateManifest } from "./lib/manifest.ts";
import { findSecrets } from "./lib/secrets.ts";

export const EXAMPLES_DIR = fromRoot("examples");

/** The schema an example validates against: the first directory under examples/. */
export function exampleSchema(path: string): string {
  return relative(EXAMPLES_DIR, path).split(/[\\/]/)[0] ?? "";
}

/** Verifies the integrity digests of evidence and receipts. */
export function checkIntegrity(
  schema: string,
  document: unknown,
  file: string,
  report: Report,
): void {
  if (!isRecord(document)) return;
  if (schema === "evidence" && typeof document["digest"] === "string") {
    const expected = digestWithout(document, "digest");
    if (document["digest"] !== expected)
      report.error("INTEGRITY", file, `evidence digest mismatch; expected ${expected}`);
  }
  if (schema === "execution-receipt" && isRecord(document["integrity"])) {
    const expected = digest(document["receipt"]);
    if (document["integrity"]["digest"] !== expected)
      report.error("INTEGRITY", file, `receipt digest mismatch; expected ${expected}`);
  }
}

/** Semantic checks beyond the schema: requests and manifests against the registry, no secrets. */
export function checkSemantics(
  schema: string,
  document: unknown,
  file: string,
  report: Report,
  registry: Registry,
  schemas: SchemaSet,
): void {
  for (const secret of findSecrets(document))
    report.error("EXAMPLE_SECRET", file, `raw secret (${secret.kind}) at ${secret.path}`);
  if (schema === "capability-request") {
    const result = validateRequest(document, registry, schemas);
    if (!result.ok)
      report.error("EXAMPLE_SEMANTIC", file, `${result.error?.code}: ${result.error?.message}`);
  }
  if (schema === "provider-manifest") {
    for (const finding of manifestErrors(validateManifest(document, registry, schemas)))
      report.error("EXAMPLE_SEMANTIC", file, `${finding.code}: ${finding.message}`);
  }
}

export function validateExamples(
  schemas: SchemaSet = loadSchemas(),
  registry: Registry = loadRegistry(),
): {
  report: Report;
  count: number;
} {
  const report = new Report();
  const files = listFiles(EXAMPLES_DIR).filter((f) => !basename(f).startsWith("_"));
  for (const file of files) {
    const schema = exampleSchema(file);
    if (dirname(file) === EXAMPLES_DIR || !schemas.names.includes(schema)) {
      report.error(
        "EXAMPLE_SCHEMA",
        file,
        `examples/<schema>/ directory '${schema}' is not a schema`,
      );
      continue;
    }
    let document: unknown;
    try {
      document = readDocument(file);
    } catch (error) {
      report.error("EXAMPLE_PARSE", file, (error as Error).message);
      continue;
    }
    for (const message of schemas.validate(schema, document)) {
      report.error("EXAMPLE_INVALID", file, `${schema}: ${message}`);
    }
    checkIntegrity(schema, document, file, report);
    checkSemantics(schema, document, file, report, registry, schemas);
  }
  return { report, count: files.length };
}
