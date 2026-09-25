# Runtime Protocol v0.1

| Field    | Value                                                                 |
| -------- | --------------------------------------------------------------------- |
| Status   | Normative · Experimental                                              |
| Protocol | `runtime/0.1`                                                         |
| Scope    | Overview, conventions, primitives, processing flow and document index |

## 1. Purpose

The Runtime Protocol lets an **actor** ask a **runtime** to fulfil an **intent**, and
lets anyone audit afterwards what happened, on whose authority, under which policy,
through which provider and with which evidence.

It is independent of any runtime product, vendor, model, credential store and
transport. A conforming implementation needs nothing but this specification, the
JSON Schemas in `schemas/0.1/` and the registry in `registry/`.

## 2. Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT** and
**MAY** are to be interpreted as described in RFC 2119 and RFC 8174 when, and only
when, they appear in all capitals.

- **Documents** are JSON values (RFC 8259). YAML 1.2 is an equivalent authoring format
  when it maps losslessly to JSON. Schemas use JSON Schema Draft 2020-12.
- **Protocol identifier.** Every exchanged document carries `protocol: runtime/0.1`.
  A receiver MUST reject a document whose `protocol` it does not support.
- **Timestamps** are RFC 3339 strings in UTC (`2026-01-01T00:00:00Z`).
- **Identifiers** (`request_id`, `execution_id`, …) are opaque tokens matching
  `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. They carry no meaning beyond identity.
- **Money** is `{ amount, currency }` with a non-negative decimal amount and an ISO 4217
  currency code. The protocol never converts currencies.
- **Unknown fields.** Core documents are closed: unknown top-level fields are invalid.
  Implementation-specific data goes under `extensions`, keyed by namespace (see
  [extensions.md](extensions.md)).
- **Schema identifiers** are URNs of the form `urn:runtime-protocol:schemas:0.1:<name>`.

## 3. Roles

| Role                  | Responsibility                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Actor**             | Requests capabilities. A human, agent, service or system identified by an identity reference.                                                              |
| **Runtime**           | Receives requests, validates them, evaluates authority and policy, resolves providers, binds credentials, executes, collects evidence and issues receipts. |
| **Provider**          | Executes capabilities it declares in a provider manifest. Never decides authority or policy.                                                               |
| **Adapter**           | The software component that realizes a provider by translating protocol semantics to a concrete system (vendor API, MCP server, CLI, local process).       |
| **Credential broker** | Materializes a `CredentialRef` into secret material inside the adapter boundary, at dispatch time.                                                         |
| **Registry**          | The canonical semantic vocabulary: domains, verbs, capabilities, profiles and traits.                                                                      |

## 4. Primitives

The v0.1 primitive set is **frozen**. Adding a top-level primitive requires an RFC.

| Primitive           | Definition                                                                                   | Specified in                       |
| ------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| `Actor`             | Who requests or performs an action, referenced as `identity://…`                             | [requests.md](requests.md)         |
| `Resource`          | Anything a capability acts upon, referenced by a URI                                         | [requests.md](requests.md)         |
| `Domain`            | A bounded area of meaning with a definition and explicit exclusions                          | [capabilities.md](capabilities.md) |
| `Verb`              | A canonical action word with a definition and rejected synonyms                              | [capabilities.md](capabilities.md) |
| `Capability`        | A versioned intent `<domain>.<verb>` with input, output, profiles, traits, risk and evidence | [capabilities.md](capabilities.md) |
| `Profile`           | A context that specializes a capability without changing its intent (`email`, `chat`)        | [capabilities.md](capabilities.md) |
| `Trait`             | An optional behaviour a provider may support (`attachments`, `delivery_receipt`)             | [capabilities.md](capabilities.md) |
| `CapabilityRequest` | A document asking a runtime to fulfil a capability                                           | [requests.md](requests.md)         |
| `Constraints`       | Caller limits on execution: timeout, deadline, cost, providers, regions                      | [requests.md](requests.md)         |
| `Provider`          | An executor that declares which capabilities it implements                                   | [providers.md](providers.md)       |
| `Adapter`           | The component that realizes a provider against a concrete system                             | [providers.md](providers.md)       |
| `CredentialRef`     | A reference to secret material (`secret://…`); never the secret itself                       | [providers.md](providers.md)       |
| `Authority`         | The deny-by-default answer to "may this actor request this capability here?"                 | [authority.md](authority.md)       |
| `Policy`            | The rules under which an authorized action may occur                                         | [policy.md](policy.md)             |
| `Execution`         | The lifecycle of one capability request, governed by a state machine                         | [execution.md](execution.md)       |
| `Observation`       | A measured fact about a subject at a point in time                                           | [execution.md](execution.md)       |
| `Event`             | A fact that occurred, published for others to react to                                       | [execution.md](execution.md)       |
| `Evidence`          | Typed, integrity-protected proof supporting claims about an execution                        | [evidence.md](evidence.md)         |
| `ExecutionReceipt`  | The canonical, vendor-neutral, auditable record of an execution                              | [evidence.md](evidence.md)         |
| `Recipe`            | A composition of capabilities (level L2); never a primitive                                  | [capabilities.md](capabilities.md) |

## 5. Processing flow

```text
Intent → Capability Request → Semantic Validation → Authority → Policy
→ Provider Resolution → CredentialRef/BYOK → Binding → Execution
→ Evidence → Execution Receipt
```

1. **Capability Request** — the actor submits a `CapabilityRequest`
   ([requests.md](requests.md)).
2. **Semantic Validation** — the runtime validates structure, rejects raw secrets,
   and checks the request against the registry: capability, version, profile, traits
   and input ([requests.md](requests.md)).
3. **Authority** — deny-by-default evaluation ([authority.md](authority.md)).
4. **Policy** — allow, deny or require approval ([policy.md](policy.md)).
5. **Provider Resolution** — deterministic selection among registered providers, with
   rejection reasons ([providers.md](providers.md)).
6. **CredentialRef/BYOK** — select a credential reference by ownership; secrets are
   materialized only inside the adapter boundary ([providers.md](providers.md)).
7. **Binding** — invoke the provider through a binding (in-process, HTTP, MCP).
8. **Execution** — state machine `pending → authorized → running → completed`
   ([execution.md](execution.md)).
9. **Evidence** — typed proof of the requested claims ([evidence.md](evidence.md)).
10. **Execution Receipt** — canonical record of the outcome
    ([evidence.md](evidence.md)).

Errors at any step use the codes in [errors.md](errors.md) and never leak secrets
([security.md](security.md)).

## 6. References

References are URIs. The protocol defines these schemes:

| Scheme         | Refers to                                  | Example                                              |
| -------------- | ------------------------------------------ | ---------------------------------------------------- |
| `identity://`  | An actor or other identity                 | `identity://user/42`                                 |
| `authority://` | An authority (role, delegation, mandate)   | `authority://company/support-manager`                |
| `secret://`    | Secret material held by a credential store | `secret://organization/providers/example-production` |
| `evidence://`  | An evidence document                       | `evidence://ev_01`                                   |
| `execution://` | An execution                               | `execution://exec_01`                                |
| `policy://`    | A policy set                               | `policy://company/default`                           |

Resources MAY be referenced by any absolute URI (`resource://crm/accounts/981`,
`https://…`). A `secret://` reference MUST NOT be used as a resource reference.

## 7. Document index

| Document                           | Content                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| [semantics.md](semantics.md)       | The semantic constitution                                               |
| [capabilities.md](capabilities.md) | Domains, verbs, capabilities, profiles, traits, recipes, registry graph |
| [requests.md](requests.md)         | Capability requests, actors, resources, constraints, validation         |
| [providers.md](providers.md)       | Providers, adapters, manifests, credentials/BYOK, resolution            |
| [authority.md](authority.md)       | Authority grants and decisions                                          |
| [policy.md](policy.md)             | Policy sets, decisions, risk and approval                               |
| [evidence.md](evidence.md)         | Evidence and execution receipts                                         |
| [execution.md](execution.md)       | Execution state machine, invocations, observations and events           |
| [discovery.md](discovery.md)       | Discovering runtimes, providers and the registry                        |
| [extensions.md](extensions.md)     | Namespaces and extension rules                                          |
| [versioning.md](versioning.md)     | Protocol, capability, provider and binding versions                     |
| [errors.md](errors.md)             | Error codes and error documents                                         |
| [security.md](security.md)         | Security requirements                                                   |
| [conformance.md](conformance.md)   | Conformance levels, the suite and provider requirements                 |

## 8. Independence

The protocol MUST NOT depend on any runtime product. Dependencies flow one way:

```text
products  →  runtime SDKs / adapters  →  runtime-protocol
```

A product MAY implement the protocol directly or through an SDK; the protocol never
references a product.

## 9. Out of scope for v0.1

Marketplaces, billing, administrative UIs, large integration catalogues, a complete
policy language, AI-driven semantic auto-merge, model training, distributed
consensus, complex workflow engines, industry ontologies, AI-driven provider ranking
and automatic capability invention. v0.1 defines the contract that makes these
possible later.
