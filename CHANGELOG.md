# Changelog

All notable changes to the Runtime Protocol are documented here. The protocol follows
the versioning rules in [spec/0.1/versioning.md](spec/0.1/versioning.md).

## Unreleased — `runtime/0.1`

Initial experimental version, introduced by
[RFC 0001](rfcs/0001-runtime-protocol-v0.1.md).

### Added

- Semantic constitution with twelve principles and the semantic lint rule index.
- Normative specification for requests, capabilities, providers, credentials/BYOK,
  authority, policy, execution, evidence, receipts, discovery, extensions,
  versioning, errors and security.
- Governance: vocabulary lifecycle, RFC process and merge gate.
- JSON Schemas (Draft 2020-12) for every exchanged document, with URN identifiers.
- Valid example documents for requests, manifests, decisions, invocations, results,
  executions, evidence, receipts, events, observations and errors.
- Deterministic tooling: schema and example validation, RFC 8785 canonical digests.
- Canonical semantic registry: 13 domains, 31 verbs, 36 capabilities, 7 profiles and
  10 traits, all experimental, with input/output schemas, trait gates, evidence claims
  and relations; the deterministic registry graph `registry/graph.json`.
- Example recipes `employee.onboard` and `support.answer`.
- Deterministic protocol validation: request validation steps 1–11, raw-secret
  detection, namespace isolation, version ranges, registry overlays and provider
  manifest checks, applied to every example.
