import { readDocument, isRecord } from "./documents.ts";
import { findSecrets } from "./secrets.ts";
import { parseCapabilityId, shadowsCore } from "./naming.ts";
import { satisfies } from "./semver.ts";
import {
  schemaPath,
  traitsEnabling,
  type Capability,
  type Entry,
  type Registry,
} from "./registry.ts";
import type { SchemaSet } from "./schemas.ts";

export type ValidationCode =
  | "invalid_request"
  | "unknown_capability"
  | "unsupported_version"
  | "unsupported_profile"
  | "missing_trait";

export interface RequestValidation {
  ok: boolean;
  error?: { code: ValidationCode; detail: string; message: string };
  warnings: Array<{ code: "deprecated_alias" | "deprecated_capability"; message: string }>;
  capability?: { id: string; version: string; requested_as?: string };
  profile?: string;
  effectiveTraits: string[];
  requiredClaims: string[];
  resource?: string;
}

export const MAX_REQUEST_BYTES = 1024 * 1024;
export const MAX_DEPTH = 32;

function depth(value: unknown): number {
  if (Array.isArray(value)) return 1 + Math.max(0, ...value.map(depth));
  if (isRecord(value)) return 1 + Math.max(0, ...Object.values(value).map(depth));
  return 0;
}

/** Registers (once) and returns the schema id of a capability's or profile's input schema. */
export function inputSchemaId(
  schemas: SchemaSet,
  entry: { file: string },
  source: { schema_ref?: string; schema?: object },
  syntheticId: string,
): string | undefined {
  if (source.schema) {
    if (!schemas.ajv.getSchema(syntheticId))
      schemas.ajv.addSchema({ ...source.schema, $id: syntheticId });
    return syntheticId;
  }
  const path = schemaPath(entry.file, source);
  if (!path) return undefined;
  const schema = readDocument(path) as Record<string, unknown>;
  const id = String(schema["$id"]);
  if (!schemas.ajv.getSchema(id)) schemas.ajv.addSchema(schema);
  return id;
}

/**
 * Deterministic request validation, steps 1–11 of spec/0.1/requests.md §5. The
 * first failing step determines the error.
 */
export function validateRequest(
  request: unknown,
  registry: Registry,
  schemas: SchemaSet,
  options: { maxBytes?: number } = {},
): RequestValidation {
  const result: RequestValidation = {
    ok: false,
    warnings: [],
    effectiveTraits: [],
    requiredClaims: [],
  };
  const fail = (code: ValidationCode, detail: string, message: string): RequestValidation => ({
    ...result,
    ok: false,
    error: { code, detail, message },
  });

  // 1. size and depth
  const size = Buffer.byteLength(JSON.stringify(request ?? null), "utf8");
  if (size > (options.maxBytes ?? MAX_REQUEST_BYTES))
    return fail("invalid_request", "payload_too_large", "The request exceeds the size limit.");
  if (depth(request) > MAX_DEPTH)
    return fail("invalid_request", "payload_too_deep", "The request is nested too deeply.");
  // 2. protocol
  if (!isRecord(request))
    return fail("invalid_request", "not_an_object", "The request must be an object.");
  if (request["protocol"] !== "runtime/0.1")
    return fail(
      "unsupported_version",
      "unsupported_protocol",
      "The protocol version is not supported.",
    );
  // 3. schema
  const schemaErrors = schemas.validate("capability-request", request);
  if (schemaErrors.length > 0)
    return fail("invalid_request", "schema_invalid", `The request is invalid: ${schemaErrors[0]}`);
  // 4. raw secrets
  if (findSecrets(request).length > 0)
    return fail("invalid_request", "raw_secret", "The request contains secret material.");
  const credential = request["credential"] as { ref?: string; owner?: string } | undefined;
  if (credential?.ref && credential.owner && credential.ref.split("/")[2] !== credential.owner)
    return fail(
      "invalid_request",
      "credential_owner_mismatch",
      "The credential owner does not match its reference.",
    );
  // 5. identifier and namespace isolation
  const requested = request["capability"] as { id: string; version: string };
  const parsed = parseCapabilityId(requested.id);
  if ("error" in parsed) return fail("invalid_request", "invalid_capability_id", parsed.error);
  const coreIds = new Set(
    [...registry.capabilities.keys()].filter((c) => {
      const p = parseCapabilityId(c);
      return !("error" in p) && p.namespace === "core";
    }),
  );
  if (shadowsCore(parsed, coreIds))
    return fail(
      "invalid_request",
      "namespace_violation",
      "The identifier shadows a core capability.",
    );
  // 6. existence, after alias normalization
  let id = requested.id;
  const alias = (registry.manifest.doc.aliases ?? []).find((a) => a.alias === id);
  if (alias) {
    id = alias.canonical;
    result.warnings.push({
      code: "deprecated_alias",
      message: `${requested.id} is a deprecated alias of ${id}`,
    });
  }
  const entry: Entry<Capability> | undefined = registry.capabilities.get(id);
  if (!entry)
    return fail(
      "unknown_capability",
      "not_registered",
      `Capability ${requested.id} does not exist.`,
    );
  const capability = entry.doc;
  if (capability.status === "deprecated")
    result.warnings.push({ code: "deprecated_capability", message: `${id} is deprecated` });
  // 7. version
  if (!satisfies(capability.version, requested.version))
    return fail(
      "unsupported_version",
      "no_matching_version",
      `No version of ${id} satisfies ${requested.version}.`,
    );
  result.capability = alias
    ? { id, version: capability.version, requested_as: requested.id }
    : { id, version: capability.version };
  // 8. profile
  const profile = request["profile"] as string | undefined;
  if (profile !== undefined) {
    if (!registry.profiles.has(profile))
      return fail("unsupported_profile", "unknown_profile", `Profile ${profile} does not exist.`);
    if (!capability.profiles.includes(profile))
      return fail(
        "unsupported_profile",
        "profile_not_accepted",
        `${id} does not accept profile ${profile}.`,
      );
    result.profile = profile;
  }
  // 9. traits
  const input = request["input"] as Record<string, unknown>;
  const traits = request["traits"] as { required?: string[]; preferred?: string[] } | undefined;
  const claims = (
    (request["evidence"] as { require?: string[] } | undefined)?.require ?? []
  ).slice();
  const declared = new Set([
    ...(capability.traits.required ?? []),
    ...(capability.traits.optional ?? []),
  ]);
  const effective = new Set<string>([
    ...(traits?.required ?? []),
    ...(capability.traits.required ?? []),
  ]);
  for (const claim of claims)
    for (const trait of traitsEnabling(registry, claim))
      if (declared.has(trait)) effective.add(trait);
  for (const [trait, fields] of Object.entries(capability.traits.input_gates ?? {}))
    if (fields.some((field) => field in input)) effective.add(trait);
  for (const trait of [...(traits?.required ?? []), ...(traits?.preferred ?? [])])
    if (!registry.traits.has(trait))
      return fail("missing_trait", "unknown_trait", `Trait ${trait} does not exist.`);
  for (const trait of effective)
    if (!declared.has(trait))
      return fail("missing_trait", "trait_not_declared", `${id} does not declare trait ${trait}.`);
  result.effectiveTraits = [...effective].sort();
  // 10. evidence claims
  for (const claim of claims)
    if (!capability.evidence.claims.includes(claim))
      return fail("invalid_request", "unsupported_claim", `${id} cannot prove claim ${claim}.`);
  const required = new Set(claims);
  if (capability.effects.mutating) required.add("execution");
  result.requiredClaims = [...required].sort();
  // 11. input against the effective schema (capability ∧ profile)
  const capabilityInput = inputSchemaId(
    schemas,
    entry,
    capability.input,
    `urn:runtime-protocol:overlay:capability:${id}:${capability.version}:input`,
  );
  if (!capabilityInput)
    return fail("invalid_request", "schema_unavailable", `No input schema for ${id}.`);
  const parts = [{ $ref: capabilityInput }];
  if (profile) {
    const profileEntry = registry.profiles.get(profile)!;
    const target = profileEntry.doc.applies_to.find((a) => a.capability === id);
    if (target?.input) {
      const profileInput = inputSchemaId(
        schemas,
        profileEntry,
        target.input,
        `urn:runtime-protocol:overlay:profile:${profile}:${id}:input`,
      );
      if (profileInput) parts.push({ $ref: profileInput });
    }
  }
  const effectiveId = `urn:runtime-protocol:effective:${id}:${capability.version}:${profile ?? "-"}:input`;
  if (!schemas.ajv.getSchema(effectiveId))
    schemas.ajv.addSchema({ $id: effectiveId, allOf: parts });
  const inputErrors = schemas.validate(effectiveId, input);
  if (inputErrors.length > 0)
    return fail("invalid_request", "input_invalid", `The input is invalid: ${inputErrors[0]}`);
  const resource = (request["resource"] as { ref?: string } | undefined)?.ref;
  const inputResource = typeof input["resource"] === "string" ? input["resource"] : undefined;
  if (resource && inputResource && resource !== inputResource)
    return fail(
      "invalid_request",
      "resource_mismatch",
      "The request resource differs from the input resource.",
    );
  result.resource = resource ?? inputResource;
  return { ...result, ok: true };
}
