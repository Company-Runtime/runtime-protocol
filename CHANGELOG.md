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
- Bindings: HTTP (`http/0.1`, with an OpenAPI 3.1 contract), MCP (`mcp/0.1`, runtime
  as MCP server and MCP servers as adapters) and events (`events/0.1`, lossless
  CloudEvents 1.0 mapping); discovery and binding descriptor examples.
- Identifier segments are lower snake case without doubled underscores, so that MCP
  tool names map reversibly.
- Actor binding: runtimes establish that the caller may act as `actor.ref`.
- Governance tooling: semantic lint (`SL001`–`SL020`) with recorded human
  acknowledgments, compatibility check against a base ref, docs consistency check, CI
  workflow, pull request and proposal templates, code owners and extension directories.
- Conformance suite 0.1.0: 55 language-neutral cases covering every required category
  and the end-to-end smoke scenario, scripted provider fixtures, case schemas,
  provider requirements `PC-001`–`PC-010`, and `spec/0.1/conformance.md`.
