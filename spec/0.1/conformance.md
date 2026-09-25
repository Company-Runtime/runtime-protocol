# Conformance

| Field    | Value                                    |
| -------- | ---------------------------------------- |
| Status   | Normative · Experimental                 |
| Protocol | `runtime/0.1`                            |
| Scope    | Conformance levels, the suite, reporting |

The suite lives in [`conformance/`](../../conformance/). It is language-neutral: cases
and fixtures are data, and any implementation can run them.

## 1. Levels

| Level        | Who claims it                                   | Passes when                                                                      |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| **Document** | Validators, registries, tooling                 | Every `level: document` case yields the expected validity, error code and detail |
| **Runtime**  | Implementations that accept capability requests | Every case of the suite passes, including the end-to-end smoke case `RP-E2E-001` |
| **Provider** | Adapters and providers                          | The provider requirements of §4 hold, verified by a provider harness             |

A conformance claim names the suite version, the protocol commit and the level, for
example "runtime/0.1 conformance suite 0.1.0, runtime level, passed", and publishes the
runner's report. Implementations MUST NOT claim a level partially.

## 2. Categories

The suite covers, at least:

| Category                   | Asserts                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `schema_validation`        | Documents are validated by schema before use                            |
| `canonical_naming`         | Identifier grammar; `core.` is never written; rejected synonyms         |
| `domain_verb_existence`    | Capabilities use declared domains and canonical verbs                   |
| `unknown_profiles`         | Unknown or unaccepted profiles are rejected                             |
| `missing_traits`           | Undeclared or unsupported traits are rejected                           |
| `version_mismatch`         | Protocol and capability version ranges                                  |
| `authority_denial`         | Deny-by-default authority, before any provider                          |
| `policy_denial`            | Policy denials and rejected approvals                                   |
| `invalid_state_transition` | Only the transitions of [execution.md](execution.md) are allowed        |
| `raw_secret_rejection`     | Secrets are rejected in requests, manifests and results, and never leak |
| `provider_resolution`      | Deterministic eligibility, ordering and rejection reasons               |
| `receipt_generation`       | Canonical, integrity-protected, vendor-neutral receipts                 |
| `evidence_requirement`     | No completion without required evidence                                 |
| `deprecated_alias`         | Aliases are normalized loudly and recorded                              |
| `namespace_isolation`      | Extensions never shadow or contaminate core                             |
| `end_to_end`               | The full flow from intent to receipt and event                          |

Additional categories (`uncertain_outcome`, `approval`, `request_identity`,
`cancellation`) cover the remaining normative behaviour.

## 3. Case format

Cases validate against `conformance/schemas/case.schema.json`. A case has a `kind`:

| Kind            | The runner…                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `document`      | validates `document` as `document_type` (schema and semantic rules)    |
| `request`       | validates `request` (steps 1–11 of [requests.md](requests.md))         |
| `state_machine` | asks the implementation whether each transition is allowed             |
| `resolution`    | resolves providers for `request` without executing                     |
| `execution`     | submits `request`, applies the `then` actions and inspects the outcome |

Documents are given as paths, inline, or as `{ $base, $patch }` where `$patch` is a
JSON Merge Patch (RFC 7396) applied to the base document.

`given` sets up the runtime: registry overlays, scripted providers (manifest plus
behaviour), an authority grant set, a policy set, credential bindings, secret material
the broker can materialize, and providers known to be unavailable. A scripted
provider's `timeout` behaviour never answers before the deadline; `unreachable` fails
before the provider receives the invocation; `{{secret}}` in an error message is
replaced by the materialized credential, to test redaction.

The `then` actions of an `execution` case run in order against the current execution:
`approve`, `reconcile`, `cancel`, `resubmit` (the same request again) and `submit`
(another request, given as a document source; its execution becomes the current one).
When an action is refused with an error and no execution — for example
`request_id_conflict` — the current execution stays the same and the error is the one
`expect.error` asserts.

`expect` lists only what the case asserts: state and history, error code and detail,
provider and reconciliation invocation counts, the number of executions, evidence
claims, events, warnings, resolution order and rejections, receipt fields, and
`forbidden` strings that must not appear in any execution, evidence, receipt or event.

## 4. Provider requirements

A provider harness verifies, for each capability a provider declares:

| Requirement | Statement                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PC-001`    | The manifest validates against its schema and the registry                                                                                                                 |
| `PC-002`    | For sample inputs, `completed` outputs validate against the capability output schema                                                                                       |
| `PC-003`    | `completed` results carry evidence for every claim required of them                                                                                                        |
| `PC-004`    | Mutating capabilities declare `idempotency` or reconciliation; with `idempotency`, repeating an invocation with the same key causes one effect and returns the same result |
| `PC-005`    | No result, error or evidence contains secret material or the materialized credential                                                                                       |
| `PC-006`    | A transport failure or timeout after dispatch is reported as `unknown`, never `failed`                                                                                     |
| `PC-007`    | Error messages are sanitized and at most 512 characters                                                                                                                    |
| `PC-008`    | Capabilities outside the core are namespaced and never shadow core identifiers                                                                                             |
| `PC-009`    | Input that violates the capability input schema fails without effects                                                                                                      |
| `PC-010`    | `health` reports availability without side effects                                                                                                                         |

Passing the provider level is the admission condition of the adapter pipeline in
[providers.md](providers.md).
