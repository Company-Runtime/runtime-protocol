# RFC 0001 — Runtime Protocol v0.1

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Status   | Accepted (bootstrap)                               |
| Created  | 2026-09-25                                         |
| Protocol | `runtime/0.1`                                      |
| Affects  | spec · schemas · registry · bindings · conformance |

## Summary

Bootstraps the Runtime Protocol: the semantic constitution, twenty frozen primitives,
the document schemas, the starter vocabulary (13 domains, 31 verbs, 36 capabilities,
7 profiles, 10 traits), the HTTP, MCP and event bindings, the deterministic tooling and
the conformance suite. Every definition introduced here is `experimental`.

## Motivation

Agents and automations need to ask for outcomes — send a message, search knowledge,
classify a ticket — without binding themselves to one vendor, model, credential model
or transport, and organizations need to audit what happened. v0.1 proves the complete
flow:

```text
Intent → Capability Request → Semantic Validation → Authority → Policy
→ Provider Resolution → CredentialRef/BYOK → Binding → Execution
→ Evidence → Execution Receipt
```

## Proposal

The normative content is [spec/0.1/](../spec/0.1/). This section records decisions that
elaborate the implementation guideline the bootstrap followed.

### Execution states

The guideline's minimal machine `pending → authorized → running → completed | failed |
cancelled` is extended with three states, each required by another rule of the
guideline:

| State               | Required by                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `awaiting_approval` | Policy can require approval; the execution must wait somewhere observable                                |
| `unknown`           | Adapters must handle uncertain outcomes without inducing duplicate retries                               |
| `rejected`          | Denials happen before any provider is invoked and must stay distinguishable from failures after dispatch |

`rejected` guarantees that no provider was invoked. `failed` means an invocation was
attempted and proven not to have completed. `unknown` is resolved only by
reconciliation.

### Uncertain outcomes and reconciliation

Providers report `completed`, `failed` (with proof that no effect occurred), `unknown`
or `running` (asynchronous). Reconciliation reports `completed`, `failed` (final) or
`inconclusive`. A runtime never re-sends a mutating invocation whose outcome is
unknown. Mutating capabilities require either the `idempotency` trait or reconciliation
support from every provider that implements them.

### Evidence claims

Requests ask for **claims** (`execution`, `delivery`, `state`, `approval`) rather than
evidence types, because callers care about what is proven, not its form. A normative
table maps claims to the evidence types that can support them. Traits can enable
claims (`delivery_receipt` → `delivery`).

### Trait gates

Input fields that only make sense with a trait (`attachments`, `thread`,
`rich_content`, `inputs`, `output_schema`, `tools`) are declared per capability.
Using a gated field makes the trait required, so resolution never selects a provider
that would silently ignore it.

### Identity creation

The guideline's example recipe `employee.onboard` starts with `identity.create`, which
is not in the starter vocabulary. Following the constitution (reuse before new
capabilities), creating an identity record is expressed as `resource.create` with
`type: identity`. The identity domain covers resolution, verification, authentication
and authorization of identities; record management stays in the resource domain.

### `structured` profile and `structured_output` trait

Both names come from the guideline. To avoid a collision they have distinct scopes:
the `structured` profile is a communication context (machine-readable messages for
machine recipients); the `structured_output` trait is a reasoning guarantee (output
conforms to a caller-supplied JSON Schema).

### Portable authority and policy formats

The protocol defines a minimal grant format and a minimal policy set so that authority
denial and policy decisions are testable across implementations. Runtimes may use any
engine that produces decisions with the same semantics.

### Schema identifiers

Schemas use URN identifiers (`urn:runtime-protocol:schemas:0.1:<name>`) so that no
identifier implies control of a domain name.

## Capability questions

The 36 starter capabilities are introduced together as the bootstrap vocabulary listed
by the implementation guideline. Each definition records `rfc: "0001"`. Every new
capability after this RFC answers the ten questions individually.

## Collision analysis

Boundaries decided in this RFC, recorded in the domain `excludes` lists:

| Pair                                           | Boundary                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `resource.search` / `knowledge.search`         | Objects by attributes vs. information by meaning with citations               |
| `communication.send` / `communication.publish` | Intended recipients vs. an audience                                           |
| `communication.publish` / `event.publish`      | Information for people vs. facts for systems                                  |
| `reasoning.generate` / `reasoning.transform`   | New content vs. same meaning in another form                                  |
| `reasoning.evaluate` / `objective.evaluate`    | Any subject against criteria vs. attainment of an objective                   |
| `verify` / `validate`                          | Truth of a claim with evidence vs. conformance to rules                       |
| `identity.authorize` / Authority               | Granting rights (a capability) vs. evaluating a request (a primitive)         |
| `policy.evaluate` / Policy                     | Policy engines as providers vs. the runtime's policy step                     |
| `execution.execute` / Execution                | Running a workload vs. the lifecycle of a capability request                  |
| `approval.request` / `approval.decide`         | Creating a pending approval vs. answering it — complementary, not overlapping |

## Compatibility

First version; nothing to break.

## Conformance

The suite in `conformance/` covers schema validation, canonical naming, domain and verb
existence, unknown profiles, missing traits, version mismatch, authority denial,
policy denial, invalid state transitions, raw secret rejection, provider resolution,
receipt generation, evidence requirements, deprecated alias behaviour and namespace
isolation, plus the end-to-end smoke scenario.

## Alternatives considered

- **Vendor-shaped capabilities** (`github.create_pull_request`): rejected by
  principles 1 and 10; vendor detail belongs to adapters.
- **Treating timeouts as failures**: rejected; a missing response does not prove a
  missing effect.
- **A complete policy language**: out of scope for v0.1; the minimal contract is
  enough to make decisions portable.

## Decision

Accepted as the bootstrap of `runtime/0.1`. All definitions are `experimental`;
promotion follows [GOVERNANCE.md](../GOVERNANCE.md).
