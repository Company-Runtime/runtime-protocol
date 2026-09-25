import { basename } from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { listFiles, readDocument, isRecord } from "./documents.ts";
import { fromRoot } from "./paths.ts";

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;

export const SCHEMA_DIR = fromRoot("schemas", "0.1");
export const SCHEMA_PREFIX = "urn:runtime-protocol:schemas:0.1:";

export function schemaNameOf(path: string): string {
  return basename(path).replace(/\.schema\.json$/, "");
}

export function createAjv(): Ajv2020 {
  // Unknown keywords and invalid numbers are errors; Ajv-specific style lints
  // (strictTypes, strictRequired, strictTuples) are off because idiomatic,
  // portable JSON Schema uses conditional `required` and untyped subschemas.
  const ajv = new Ajv2020({
    strictSchema: true,
    strictNumbers: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    allErrors: true,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  return ajv;
}

export interface SchemaSet {
  ajv: Ajv2020;
  names: string[];
  validator(name: string): ValidateFunction;
  validate(name: string, document: unknown): string[];
}

/** Loads every protocol schema into one Ajv instance so URN references resolve. */
export function loadSchemas(extra: Array<Record<string, unknown>> = []): SchemaSet {
  const ajv = createAjv();
  const names: string[] = [];
  for (const path of listFiles(SCHEMA_DIR, [".json"])) {
    const schema = readDocument(path);
    if (!isRecord(schema)) throw new Error(`${path}: schema is not an object`);
    ajv.addSchema(schema);
    names.push(schemaNameOf(path));
  }
  for (const schema of extra) ajv.addSchema(schema);
  const cache = new Map<string, ValidateFunction>();
  const validator = (name: string): ValidateFunction => {
    const key = name.startsWith("urn:") ? name : SCHEMA_PREFIX + name;
    let fn = cache.get(key);
    if (!fn) {
      const found = ajv.getSchema(key);
      if (!found) throw new Error(`unknown schema ${key}`);
      fn = found;
      cache.set(key, fn);
    }
    return fn;
  };
  return {
    ajv,
    names,
    validator,
    validate(name, document) {
      const fn = validator(name);
      return fn(document) ? [] : formatErrors(fn.errors);
    },
  };
}

export function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return [];
  const lines = errors
    .filter((e) => e.keyword !== "if")
    .map((e) => {
      const where = e.instancePath === "" ? "(root)" : e.instancePath;
      const extra =
        e.keyword === "additionalProperties" || e.keyword === "unevaluatedProperties"
          ? ` '${String((e.params as Record<string, unknown>)["additionalProperty"] ?? (e.params as Record<string, unknown>)["unevaluatedProperty"])}'`
          : e.keyword === "enum"
            ? ` ${JSON.stringify((e.params as Record<string, unknown>)["allowedValues"])}`
            : "";
      return `${where} ${e.message ?? e.keyword}${extra}`;
    });
  return [...new Set(lines)];
}
