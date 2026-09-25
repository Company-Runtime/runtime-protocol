# Capabilities, Vocabulary and Recipes

| Field    | Value                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| Status   | Normative · Experimental                                                       |
| Protocol | `runtime/0.1`                                                                  |
| Scope    | Domains, verbs, capabilities, profiles, traits, recipes and the registry graph |

The registry in `registry/` is the machine-readable form of this document. Every
entry validates against its schema in `schemas/0.1/` (`domain`, `verb`, `capability`,
`profile`, `trait`).

## 1. Domains

A **Domain** is a bounded area of meaning. Each domain declares a `definition` and an
explicit list of `excludes` — what the domain is _not_ about — so that overlaps are
decided once.

Core domains in v0.1:

```text
identity organization resource knowledge communication event
work objective approval policy reasoning execution evidence
```

Domain identifiers are single lower-snake-case segments and MUST NOT equal a namespace keyword
(`core`, `experimental`, `community`, `vendor`, `org`).

## 2. Verbs

A **Verb** is a canonical action word. Each verb declares:

- `definition` — what the action means, independent of any domain;
- `past_tense` — used to name the events the action produces (`send` → `sent`);
- `mutating` — whether the action changes state (`true`, `false` or `varies`);
- `rejected_synonyms` — words that MUST NOT be used instead of the verb.

Canonical verbs in v0.1:

```text
read search list create update delete send receive publish request decide
assign claim release start pause resume complete cancel verify validate
evaluate classify generate transform execute record resolve authenticate
authorize subscribe
```

Silent synonyms are prohibited: `run`, `invoke` and `perform` are rejected synonyms of
`execute`. A rejected synonym belongs to exactly one verb.

## 3. Capabilities

A **Capability** is a versioned intent. Definition fields:

```yaml
id: communication.send
version: 0.1.0
status: experimental
domain: communication
verb: send
description: Deliver information to intended recipients.
input: { schema_ref: ./input.schema.json }
output: { schema_ref: ./output.schema.json }
profiles: [email, chat, sms, push, structured]
traits:
  optional: [attachments, delivery_receipt, rich_text, threading, idempotency]
  input_gates:
    attachments: [attachments]
    threading: [thread]
    rich_text: [rich_content]
authority: { required: true }
evidence: { supported: true, claims: [execution, delivery] }
risk: { default: low }
effects: { mutating: true }
emits: [communication.sent]
relations:
  requires: [identity]
  related: [communication.publish, communication.receive]
rfc: "0001"
```

| Field                | Rule                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                 | `<domain>.<verb>`; `<domain>.<object>.<verb>` only with `object_justification` (see §3.1)            |
| `version`            | Semantic version of the capability definition ([versioning.md](versioning.md))                       |
| `status`             | `experimental`, `candidate`, `stable` or `deprecated`. Everything starts `experimental`.             |
| `domain`, `verb`     | MUST equal the first and last identifier segments and exist in the registry                          |
| `input`, `output`    | JSON Schemas (Draft 2020-12) for the request `input` and the execution `output`                      |
| `profiles`           | Profiles the capability accepts; each profile MUST list the capability in its `applies_to`           |
| `traits.required`    | Traits every provider of the capability MUST support                                                 |
| `traits.optional`    | Traits a provider MAY support and a request MAY require                                              |
| `traits.input_gates` | Top-level input fields that are only valid with a trait; using the field makes the trait required    |
| `authority.required` | MUST be `true` in v0.1: every capability is subject to authority                                     |
| `evidence.claims`    | Claims evidence can establish for this capability ([evidence.md](evidence.md))                       |
| `risk.default`       | `none`, `low`, `medium`, `high` or `critical` — an input to policy, never a policy                   |
| `effects.mutating`   | `true` when the capability changes state outside the execution                                       |
| `emits`              | Event types published when an execution completes; for mutating capabilities `<domain>.<past tense>` |
| `relations`          | Graph edges: domains it `requires`, capabilities it is `related` to                                  |
| `rfc`                | The RFC that introduced or last changed the definition                                               |

Capability definitions MUST NOT contain policy (approvals, allow-lists, quotas); see
principle 8 in [semantics.md](semantics.md).

### 3.1 Naming

- Preferred form: `<domain>.<verb>` (`knowledge.search`).
- `<domain>.<object>.<verb>` is allowed only when profiles, traits, schemas and
  composition cannot express the intent. The definition MUST include
  `object_justification`.
- Vendor names, product names and transport terms are prohibited in core identifiers.
- Identifier segments are lower snake case, `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`: no leading,
  trailing or doubled underscores, so that `.` maps reversibly to `__` in the
  [MCP binding](../../bindings/mcp/README.md). Namespaced identifiers are defined in
  [extensions.md](extensions.md).
- Core identifiers are written without a prefix. `core.` MUST NOT be written; the
  core namespace is implicit.

### 3.2 Status lifecycle

```text
experimental → candidate → stable → deprecated
```

Promotion criteria are defined in [GOVERNANCE.md](../../GOVERNANCE.md). A deprecated
capability MUST name its replacement in `deprecation.replaced_by`.

### 3.3 Deprecated aliases

A registry MAY declare a deprecated alias — an old identifier that maps to a canonical
capability:

```yaml
aliases:
  - alias: org.acme.message.dispatch
    canonical: communication.send
    since: 0.1.0
    remove_after: 0.2.0
```

A runtime receiving a request for an alias MUST normalize it to the canonical
identifier, MUST record the requested identifier in the receipt
(`capability.requested_as`) and MUST attach a `deprecated_alias` warning. Aliases are
never silent and never chain. The v0.1 core registry declares no aliases.

## 4. Profiles

A **Profile** specializes the context of a capability without changing its intent.

```yaml
id: email
version: 0.1.0
status: experimental
definition: Asynchronous message delivery addressed to mailboxes, with a subject line.
applies_to:
  - capability: communication.send
    input: { schema_ref: ./communication.send.input.schema.json }
  - capability: communication.receive
```

- A request MAY name at most one profile. A request without a profile accepts any
  provider regardless of the profiles it declares.
- A profile MAY constrain the capability input for a given capability. The effective
  input schema is the conjunction (`allOf`) of the capability input schema and the
  profile input schema.
- Core profiles in v0.1: `email`, `chat`, `sms`, `push`, `broadcast`, `structured`,
  `conversational`.

## 5. Traits

A **Trait** is an optional behaviour that composes with any capability that lists it.

- Core traits in v0.1: `attachments`, `rich_text`, `threading`, `streaming`, `batch`,
  `delivery_receipt`, `idempotency`, `structured_output`, `tool_use`, `async`.
- A trait MAY enable evidence claims (`delivery_receipt` enables `delivery`).
- The **effective required traits** of a request are the union of:
  1. `traits.required` in the request;
  2. traits that enable a claim listed in `evidence.require`;
  3. traits gating input fields present in the request `input`;
  4. `traits.required` of the capability definition.
- Every effective required trait MUST be declared by the capability (required or
  optional); otherwise the request fails with `missing_trait`.
- `traits.preferred` in a request never excludes a provider; it only orders eligible
  providers ([providers.md](providers.md)).

## 6. Recipes and levels

| Level | Name                   | Belongs to the canonical vocabulary |
| ----- | ---------------------- | ----------------------------------- |
| L0    | Primitive (capability) | Yes                                 |
| L1    | Profile                | Yes, as context of an L0 capability |
| L2    | Recipe                 | No — composition                    |
| L3    | Organizational process | No — owned by organizations         |

A **Recipe** is an ordered composition of capability requests:

```yaml
id: employee.onboard
version: 0.1.0
status: experimental
level: L2
steps:
  - id: create_identity
    capability: resource.create
    input: { type: identity, content: { $from: inputs.person } }
  - id: grant_access
    capability: identity.authorize
    input:
      {
        subject: { $from: steps.create_identity.output.resource.ref },
        grant: { $from: inputs.grant },
      }
```

- Step inputs are literal values or `{ $from: <path> }` bindings, where `<path>` is
  `inputs.<field>…` or `steps.<step-id>.output.<field>…`.
- Every step capability MUST exist in the registry.
- Recipe identifiers MUST NOT equal capability identifiers, and recipes MUST NOT be
  registered as capabilities.
- Each step is a separate `CapabilityRequest` — with its own authority, policy,
  resolution, evidence and receipt. A recipe never bypasses per-step authority.

## 7. Registry graph

The registry is a graph, not a list. Nodes are domains, verbs, capabilities, profiles,
traits, evidence claims and event types. Edges:

| Edge               | From → To                   |
| ------------------ | --------------------------- |
| `in_domain`        | capability → domain         |
| `uses_verb`        | capability → verb           |
| `supports_profile` | capability → profile        |
| `requires_trait`   | capability → trait          |
| `supports_trait`   | capability → trait          |
| `requires_domain`  | capability → domain         |
| `related_to`       | capability → capability     |
| `produces_claim`   | capability → evidence claim |
| `emits`            | capability → event type     |
| `enables_claim`    | trait → evidence claim      |

`registry/graph.json` is generated deterministically from the registry and checked in
CI. It is suitable for machine consumers (semantic analysis, discovery UIs) without
making any of them a dependency of the protocol.
