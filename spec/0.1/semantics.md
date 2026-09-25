# Semantic Constitution

| Field    | Value                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------- |
| Status   | Normative                                                                                      |
| Protocol | `runtime/0.1`                                                                                  |
| Scope    | The principles every primitive, capability, profile, trait, binding and extension must respect |

The Runtime Protocol is a vocabulary before it is a wire format. Vocabularies decay
when every new integration adds a word. This constitution exists to keep the
vocabulary small, stable, intent-based and vendor-neutral.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are to be
interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in
all capitals.

Each principle states a rule, its rationale, and how it is enforced. Rule identifiers
of the form `SLnnn` refer to deterministic checks of the semantic lint
(`tooling/semantic-lint`). A deterministic failure blocks a change; similarity-based
findings require human review.

## 1. Intent over implementation

A capability names **what the caller wants to happen**, never how or where it happens.

- Capability identifiers MUST describe an intent: `communication.send`, not
  `slack.send-message` or `smtp.deliver`.
- A caller MUST be able to express a request without knowing which provider will
  fulfil it.

Rationale: callers that encode implementations cannot swap them. Enforced by `SL001`,
`SL009`.

## 2. Semantics over endpoints

An API endpoint does not automatically become a capability.

- A new capability MUST represent an intent that no existing capability expresses,
  with an **observable difference for the caller** (different outcome, different
  evidence, different authority question).
- Mirroring a vendor's operation list into the registry is prohibited.

Rationale: endpoints describe a vendor's surface; capabilities describe the
caller's world. Enforced by `SL008`, `SL013`.

## 3. Composition over proliferation

Before proposing a primitive, try a **Recipe** — a composition of existing
capabilities.

- Work that is expressible as a sequence of existing capabilities MUST be a Recipe
  (level L2), not a new capability.
- Recipes MUST NOT be registered as capabilities, and recipe identifiers MUST NOT
  collide with capability identifiers.

Rationale: composed intents multiply naturally; primitives must not. Enforced by
`SL010`, `SL011`.

## 4. Profiles over specialization

When the intent is the same and only the context differs, use a **Profile**.

- `communication.send` with profile `email` — never `communication.send-email` or
  `communication.email.send` when `communication.send` already expresses the intent.
- A capability identifier MUST NOT embed a registered profile name.
- The three-segment form `<domain>.<object>.<verb>` is allowed only when profiles,
  traits, schemas and composition cannot express the intent, and the capability
  definition MUST record why (`object_justification`).

Rationale: specializations fragment one intent into many words. Enforced by `SL005`,
`SL006`.

## 5. Traits over variants

Optional behaviour — attachments, streaming, threading, delivery receipts, batching —
is a **Trait**, not a new capability.

- A capability identifier MUST NOT embed a registered trait name
  (`communication.send_with_attachments` is invalid).
- Input fields that only make sense with a trait are gated by that trait; using them
  implies the trait is required.

Rationale: variants multiply combinatorially; traits compose. Enforced by `SL007`.

## 6. Evidence over assertion

`success: true` proves nothing. An execution is **completed** only when the evidence
required for it exists.

- Every capability that changes state outside the execution (`effects.mutating: true`)
  MUST support evidence with at least the `execution` claim.
- A runtime MUST NOT report an execution as `completed` when required evidence is
  missing. For a mutating capability the outcome is `unknown` until reconciled; for a
  non-mutating capability it is `failed` with `evidence_missing`.
- Evidence is a separate, typed, integrity-protected document — never a boolean.

Rationale: assertions cannot be audited; evidence can. Enforced by `SL014` and by the
conformance suite (`evidence_requirement`).

## 7. Authority before execution

Authority answers: _may this Actor request this Capability over this Resource in this
Context?_

- Authority MUST be evaluated before any provider is invoked.
- Authority MUST be deny-by-default: absence of a matching grant is a denial.
- Providers MUST NOT receive, evaluate or widen authority decisions.

Rationale: acting first and checking later cannot be undone. Enforced by the
conformance suite (`authority_denial`).

## 8. Policy outside capability

Policy answers: _under which rules may this action occur?_ It lives outside the
capability definition.

- Capability definitions MUST NOT contain approval requirements, allow-lists or other
  policy. A capability declares a default **risk**; policy decides what the risk
  implies.
- Risk MUST NOT trigger approval by itself. Only a policy decision can require
  approval.

Rationale: the same capability is governed differently by different organizations.
Enforced by the capability schema (no policy fields) and by the conformance suite
(`policy_denial`).

## 9. Transport independence

HTTP, MCP and event buses are **bindings**. They carry the protocol; they never
define it.

- A binding MUST NOT change the meaning of a capability, request, receipt or error.
- Core identifiers and definitions MUST NOT reference transports.
- MCP is an interoperability transport, not a source of the ontology.

Rationale: meaning that depends on a transport cannot move between transports.
Enforced by `SL019`.

## 10. Vendor neutrality

The core vocabulary contains no vendor.

- Core capability, profile, trait, domain and verb identifiers, descriptions and
  input/output schemas MUST NOT contain vendor or product names.
- Vendor-specific behaviour belongs to adapters, or to the `vendor.<vendor>.*`
  namespace.
- Receipts, evidence and errors MUST be representable without vendor-specific
  structure; vendor detail MAY appear only under namespaced `extensions`.

Rationale: a vendor in the core makes every other vendor second-class. Enforced by
`SL009`.

## 11. Extensions before standardization

New semantics start outside the core.

- New vocabulary MUST start in an extension namespace (`experimental.*`,
  `community.<author>.*`, `vendor.<vendor>.*`, `org.<org>.*`) or with status
  `experimental`.
- Promotion follows the lifecycle in [GOVERNANCE.md](../../GOVERNANCE.md):
  Extension → Experimental → RFC → Collision Analysis → Independent Implementations →
  Real Usage → Semantic Review → Candidate → Stable.
- Extensions MUST NOT shadow or contaminate core identifiers.

Rationale: real usage is the only evidence that a word deserves to exist. Enforced by
`SL012`, `SL017`.

## 12. Semantic stability over vocabulary growth

A stable meaning is worth more than a new word.

- The core vocabulary targets **30–50 capabilities**, not hundreds.
- Silent synonyms are prohibited: every verb lists its rejected synonyms (`run` for
  `execute`), and a proposal using a synonym is rejected.
- Deprecated aliases MAY exist only explicitly, with a canonical replacement, and
  requests using them MUST be normalized with a `deprecated_alias` warning.
- Breaking changes to a capability's meaning, input or output require a new major
  version (a new minor version while the major version is `0`).

Rationale: every synonym is a future inconsistency. Enforced by `SL004`, `SL018`,
`SL020` and the compatibility check.

## Deterministic governance, advisory AI

Normative decisions — authority, policy, conformance, schema validity, naming — MUST
be deterministic and reproducible. Language models MAY assist as advisory tools
(suggesting collisions, drafting collision analyses) but MUST NOT decide authority,
policy, conformance or promotion. Humans govern the vocabulary.

## The ten questions

Every proposal for a new capability MUST answer:

1. Which new intent does it represent?
2. Why does no existing capability serve?
3. Why does a profile not serve?
4. Why does a trait not serve?
5. Why does a Recipe not serve?
6. Is there vendor leakage?
7. Are there at least two plausible independent executors?
8. What observable difference exists for the caller?
9. Which evidence proves completion?
10. Which existing primitives are closest?

## Lint rule index

| Rule    | Principle | Check                                                                  | Severity |
| ------- | --------- | ---------------------------------------------------------------------- | -------- |
| `SL001` | 1         | Identifier matches the canonical grammar                               | error    |
| `SL002` | 1         | Domain segment is a registered domain                                  | error    |
| `SL003` | 1         | Verb segment is a canonical verb                                       | error    |
| `SL004` | 12        | Verb segment is a rejected synonym of a canonical verb                 | error    |
| `SL005` | 4         | Three-segment identifier without `object_justification`                | error    |
| `SL006` | 4         | Identifier embeds a registered profile name                            | error    |
| `SL007` | 5         | Identifier embeds a registered trait name                              | error    |
| `SL008` | 2         | Same domain and verb as an existing capability, or similar description | warning  |
| `SL009` | 10        | Vendor or product name in core vocabulary                              | error    |
| `SL010` | 3         | Description combines several intents; consider a Recipe                | warning  |
| `SL011` | 3         | Recipe collides with or is registered as a capability                  | error    |
| `SL012` | 11        | Identifier violates namespace isolation                                | error    |
| `SL013` | 2         | New capability without an answered proposal                            | error    |
| `SL014` | 6         | Mutating capability without `execution` evidence                       | error    |
| `SL015` | 6         | `effects.mutating` contradicts the verb                                | error    |
| `SL016` | 9         | Emitted event type does not follow `<domain>.<past tense of verb>`     | error    |
| `SL017` | 11        | New vocabulary does not start as `experimental`                        | error    |
| `SL018` | 12        | Duplicate or overlapping rejected synonyms across verbs                | error    |
| `SL019` | 9         | Transport term in core vocabulary                                      | error    |
| `SL020` | 12        | Core vocabulary exceeds the 50-capability budget                       | warning  |
