import { listFiles, readDocument, isRecord } from "./lib/documents.ts";
import { Report } from "./lib/findings.ts";
import { createAjv, SCHEMA_DIR, SCHEMA_PREFIX, schemaNameOf } from "./lib/schemas.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/**
 * Checks every schema in schemas/0.1: JSON Schema 2020-12, a URN `$id` matching
 * the file name, a title and description, and successful compilation with all
 * cross-schema references resolved.
 */
export function validateSchemas(): Report {
  const report = new Report();
  const ajv = createAjv();
  const files = listFiles(SCHEMA_DIR, [".json"]);
  const loaded: Array<{ path: string; id: string }> = [];
  for (const path of files) {
    if (!path.endsWith(".schema.json")) {
      report.error("SCHEMA_FILE", path, "schema files must end in .schema.json");
      continue;
    }
    let schema: unknown;
    try {
      schema = readDocument(path);
    } catch (error) {
      report.error("SCHEMA_PARSE", path, (error as Error).message);
      continue;
    }
    if (!isRecord(schema)) {
      report.error("SCHEMA_SHAPE", path, "schema must be an object");
      continue;
    }
    const expectedId = SCHEMA_PREFIX + schemaNameOf(path);
    if (schema["$schema"] !== DRAFT) report.error("SCHEMA_DRAFT", path, `$schema must be ${DRAFT}`);
    if (schema["$id"] !== expectedId) report.error("SCHEMA_ID", path, `$id must be ${expectedId}`);
    if (typeof schema["title"] !== "string")
      report.error("SCHEMA_TITLE", path, "title is required");
    if (typeof schema["description"] !== "string")
      report.error("SCHEMA_DESCRIPTION", path, "description is required");
    try {
      ajv.addSchema(schema);
      loaded.push({ path, id: expectedId });
    } catch (error) {
      report.error("SCHEMA_INVALID", path, (error as Error).message);
    }
  }
  for (const { path, id } of loaded) {
    try {
      ajv.getSchema(id);
    } catch (error) {
      report.error("SCHEMA_COMPILE", path, (error as Error).message);
    }
  }
  return report;
}
