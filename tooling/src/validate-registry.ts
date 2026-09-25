import { basename, dirname } from "node:path";
import { readDocument, isRecord } from "./lib/documents.ts";
import { Report } from "./lib/findings.ts";
import { loadSchemas, type SchemaSet } from "./lib/schemas.ts";
import {
  CORE_CLAIMS,
  NAMESPACES,
  loadRegistry,
  namespaceOf,
  schemaPath,
  traitsEnabling,
  type Capability,
  type Registry,
} from "./lib/registry.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/** Loads and compiles a definition's JSON Schema file; returns its top-level properties. */
function checkSchemaFile(
  schemas: SchemaSet,
  report: Report,
  definitionFile: string,
  source: { schema_ref?: string; schema?: object },
  expectedId: string,
  rule: string,
): Set<string> | undefined {
  if (source.schema) return propertiesOf(source.schema);
  const path = schemaPath(definitionFile, source);
  if (!path) {
    report.error(rule, definitionFile, `schema file ${source.schema_ref ?? "?"} does not exist`);
    return undefined;
  }
  const schema = readDocument(path);
  if (!isRecord(schema)) {
    report.error(rule, path, "schema must be an object");
    return undefined;
  }
  if (schema["$schema"] !== DRAFT) report.error(rule, path, `$schema must be ${DRAFT}`);
  if (schema["$id"] !== expectedId) report.error(rule, path, `$id must be ${expectedId}`);
  try {
    if (!schemas.ajv.getSchema(expectedId)) schemas.ajv.addSchema(schema);
    schemas.ajv.getSchema(expectedId);
  } catch (error) {
    report.error(rule, path, `does not compile: ${(error as Error).message}`);
  }
  return propertiesOf(schema);
}

function propertiesOf(schema: unknown): Set<string> {
  return new Set(
    isRecord(schema) && isRecord(schema["properties"]) ? Object.keys(schema["properties"]) : [],
  );
}

function fileMatches(report: Report, file: string, id: string, expected: string): void {
  if (expected !== id)
    report.error("REG_FILENAME", file, `file or directory must be named after id '${id}'`);
}

/** Collects `$from` paths in a recipe step input. */
function fromPaths(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) fromPaths(item, out);
  else if (isRecord(value)) {
    if (typeof value["$from"] === "string" && Object.keys(value).length === 1)
      out.push(value["$from"]);
    else for (const item of Object.values(value)) fromPaths(item, out);
  }
  return out;
}

export function validateRegistry(
  registry: Registry = loadRegistry(),
  schemas: SchemaSet = loadSchemas(),
): { report: Report; summary: string } {
  const report = new Report();
  for (const { file, message } of registry.parseErrors) report.error("REG_PARSE", file, message);

  const schemaCheck = (name: string, file: string, doc: unknown) => {
    for (const message of schemas.validate(name, doc))
      report.error("REG_SCHEMA", file, `${name}: ${message}`);
  };
  schemaCheck("registry", registry.manifest.file, registry.manifest.doc);

  for (const [id, { file, doc }] of registry.domains) {
    schemaCheck("domain", file, doc);
    fileMatches(report, file, id, basename(file, ".yaml"));
    if ((NAMESPACES as readonly string[]).includes(id))
      report.error("REG_NAMESPACE", file, `'${id}' is a reserved namespace word`);
  }
  for (const [id, { file, doc }] of registry.verbs) {
    schemaCheck("verb", file, doc);
    fileMatches(report, file, id, basename(file, ".yaml"));
  }
  for (const [id, { file, doc }] of registry.traits) {
    schemaCheck("trait", file, doc);
    fileMatches(report, file, id, basename(file, ".yaml"));
    if (namespaceOf(id) !== "core")
      report.error("REG_NAMESPACE", file, "the core registry holds only core traits");
    for (const claim of doc.enables_claims ?? [])
      if (!(CORE_CLAIMS as readonly string[]).includes(claim))
        report.error("REG_CLAIM", file, `unknown core claim '${claim}'`);
  }
  for (const [id, { file, doc }] of registry.profiles) {
    schemaCheck("profile", file, doc);
    fileMatches(report, file, id, basename(dirname(file)));
    if (namespaceOf(id) !== "core")
      report.error("REG_NAMESPACE", file, "the core registry holds only core profiles");
    for (const target of doc.applies_to ?? []) {
      const capability = registry.capabilities.get(target.capability);
      if (!capability) {
        report.error("REG_PROFILE", file, `applies to unknown capability '${target.capability}'`);
        continue;
      }
      if (!capability.doc.profiles.includes(id))
        report.error("REG_PROFILE", file, `${target.capability} does not list profile '${id}'`);
      if (target.input) {
        checkSchemaFile(
          schemas,
          report,
          file,
          target.input,
          `urn:runtime-protocol:registry:profile:${id}:${doc.version}:${target.capability}:input`,
          "REG_PROFILE",
        );
      }
    }
  }

  for (const [id, { file, doc }] of registry.capabilities) {
    schemaCheck("capability", file, doc);
    fileMatches(report, file, id, basename(dirname(file)));
    checkCapability(registry, schemas, report, id, file, doc);
  }

  const aliases = registry.manifest.doc.aliases ?? [];
  const seen = new Set<string>();
  for (const alias of aliases) {
    const file = registry.manifest.file;
    if (seen.has(alias.alias)) report.error("REG_ALIAS", file, `duplicate alias '${alias.alias}'`);
    seen.add(alias.alias);
    if (registry.capabilities.has(alias.alias))
      report.error("REG_ALIAS", file, `alias '${alias.alias}' is a registered capability`);
    if (!registry.capabilities.has(alias.canonical))
      report.error(
        "REG_ALIAS",
        file,
        `alias '${alias.alias}' targets unknown '${alias.canonical}'`,
      );
    if (aliases.some((a) => a.alias === alias.canonical))
      report.error("REG_ALIAS", file, `alias '${alias.alias}' chains to another alias`);
  }

  for (const [id, { file, doc }] of registry.recipes) {
    schemaCheck("recipe", file, doc);
    if (registry.capabilities.has(id))
      report.error("REG_RECIPE", file, `recipe '${id}' collides with a capability`);
    const inputs = new Set(Object.keys(doc.inputs?.properties ?? {}));
    const earlier = new Set<string>();
    for (const step of doc.steps ?? []) {
      const capability = registry.capabilities.get(step.capability);
      if (!capability)
        report.error(
          "REG_RECIPE",
          file,
          `step '${step.id}' uses unknown capability '${step.capability}'`,
        );
      else if (step.profile && !capability.doc.profiles.includes(step.profile))
        report.error(
          "REG_RECIPE",
          file,
          `step '${step.id}': ${step.capability} does not accept profile '${step.profile}'`,
        );
      for (const trait of step.traits?.required ?? []) {
        const declared = [
          ...(capability?.doc.traits.required ?? []),
          ...(capability?.doc.traits.optional ?? []),
        ];
        if (!declared.includes(trait))
          report.error(
            "REG_RECIPE",
            file,
            `step '${step.id}': trait '${trait}' is not declared by ${step.capability}`,
          );
      }
      for (const path of fromPaths(step.input)) {
        const [head, name] = path.split(".");
        const ok =
          (head === "inputs" && name !== undefined && (inputs.size === 0 || inputs.has(name))) ||
          (head === "steps" &&
            name !== undefined &&
            earlier.has(name) &&
            path.split(".")[2] === "output");
        if (!ok)
          report.error("REG_RECIPE", file, `step '${step.id}': invalid binding '$from: ${path}'`);
      }
      if (earlier.has(step.id)) report.error("REG_RECIPE", file, `duplicate step id '${step.id}'`);
      earlier.add(step.id);
    }
  }

  const summary = [
    `${registry.domains.size} domains`,
    `${registry.verbs.size} verbs`,
    `${registry.capabilities.size} capabilities`,
    `${registry.profiles.size} profiles`,
    `${registry.traits.size} traits`,
    `${registry.recipes.size} recipes`,
  ].join(", ");
  return { report, summary };
}

function checkCapability(
  registry: Registry,
  schemas: SchemaSet,
  report: Report,
  id: string,
  file: string,
  doc: Capability,
): void {
  if (namespaceOf(id) !== "core")
    report.error("REG_NAMESPACE", file, "the core registry holds only core capabilities");
  const segments = id.split(".");
  if (segments[0] !== doc.domain)
    report.error("REG_DOMAIN", file, `domain must be the first segment of '${id}'`);
  if (segments[segments.length - 1] !== doc.verb)
    report.error("REG_VERB", file, `verb must be the last segment of '${id}'`);
  if (!registry.domains.has(doc.domain))
    report.error("REG_DOMAIN", file, `unknown domain '${doc.domain}'`);
  if (!registry.verbs.has(doc.verb)) report.error("REG_VERB", file, `unknown verb '${doc.verb}'`);

  for (const profile of doc.profiles ?? []) {
    const entry = registry.profiles.get(profile);
    if (!entry) report.error("REG_PROFILE", file, `unknown profile '${profile}'`);
    else if (!entry.doc.applies_to.some((a) => a.capability === id))
      report.error("REG_PROFILE", file, `profile '${profile}' does not apply to ${id}`);
  }
  const required = doc.traits?.required ?? [];
  const optional = doc.traits?.optional ?? [];
  for (const trait of [...required, ...optional])
    if (!registry.traits.has(trait)) report.error("REG_TRAIT", file, `unknown trait '${trait}'`);
  for (const trait of required)
    if (optional.includes(trait))
      report.error("REG_TRAIT", file, `trait '${trait}' is both required and optional`);

  const version = doc.version;
  const inputProps = checkSchemaFile(
    schemas,
    report,
    file,
    doc.input ?? {},
    `urn:runtime-protocol:registry:capability:${id}:${version}:input`,
    "REG_INPUT",
  );
  checkSchemaFile(
    schemas,
    report,
    file,
    doc.output ?? {},
    `urn:runtime-protocol:registry:capability:${id}:${version}:output`,
    "REG_OUTPUT",
  );

  for (const [trait, fields] of Object.entries(doc.traits?.input_gates ?? {})) {
    if (![...required, ...optional].includes(trait))
      report.error("REG_GATE", file, `input gate for undeclared trait '${trait}'`);
    for (const field of fields)
      if (inputProps && !inputProps.has(field))
        report.error("REG_GATE", file, `gated field '${field}' is not an input property`);
  }
  for (const claim of doc.evidence?.claims ?? []) {
    if (!(CORE_CLAIMS as readonly string[]).includes(claim))
      report.error("REG_CLAIM", file, `unknown core claim '${claim}'`);
    const enabling = traitsEnabling(registry, claim);
    if (enabling.length > 0 && !enabling.some((t) => required.includes(t) || optional.includes(t)))
      report.error(
        "REG_CLAIM",
        file,
        `claim '${claim}' needs one of the traits ${enabling.join(", ")}`,
      );
  }
  for (const domain of doc.relations?.requires ?? [])
    if (!registry.domains.has(domain))
      report.error("REG_RELATION", file, `requires unknown domain '${domain}'`);
  for (const related of doc.relations?.related ?? []) {
    if (related === id)
      report.error("REG_RELATION", file, "a capability cannot be related to itself");
    else if (!registry.capabilities.has(related) && namespaceOf(related) !== "experimental")
      report.error("REG_RELATION", file, `related to unknown capability '${related}'`);
  }
  if (doc.deprecation && !registry.capabilities.has(doc.deprecation.replaced_by))
    report.error(
      "REG_DEPRECATION",
      file,
      `replaced_by unknown capability '${doc.deprecation.replaced_by}'`,
    );
}
