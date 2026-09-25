# Evidence and Execution Receipts

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Status   | Normative · Experimental                                   |
| Protocol | `runtime/0.1`                                              |
| Scope    | `Evidence`, evidence claims, integrity, `ExecutionReceipt` |

Schemas: `evidence`, `execution-receipt`.

## 1. Principle

Evidence over assertion: a provider saying `success: true` proves nothing. Evidence
is a separate, typed document that supports explicit **claims** about an execution.

## 2. Evidence document

```yaml
protocol: runtime/0.1
id: ev_01
execution_id: exec_01
type: provider_receipt
claims: [execution]
produced_by: { provider: example-provider }
observed_at: 2026-01-01T00:00:01Z
subject: { ref: resource://outbox/msg-1 }
data: { accepted_at: 2026-01-01T00:00:01Z, recipients: 1 }
digest: sha256:4f0c…
```

| Field          | Rule                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `id`           | Assigned by the runtime; referenced as `evidence://<id>`                                       |
| `execution_id` | The execution the evidence belongs to                                                          |
| `type`         | One of the evidence types (§3) or a namespaced extension type                                  |
| `claims`       | The claims this evidence supports (§4); at least one                                           |
| `produced_by`  | `{ provider }` for provider-produced evidence or `{ actor }` for evidence produced by an actor |
| `observed_at`  | When the evidenced fact was observed                                                           |
| `subject`      | The resource the evidence is about                                                             |
| `data`         | Structured, vendor-neutral content                                                             |
| `external_ref` | A URI in an external system that independently records the fact                                |
| `content`      | Artifact descriptor: `media_type`, `digest`, optional `size` and `uri`                         |
| `signature`    | A signature in a standard format (for example JWS); the protocol defines no cryptography       |
| `digest`       | Integrity digest of the document (§5), computed by the runtime                                 |
| `extensions`   | Namespaced, vendor-specific detail                                                             |

## 3. Evidence types

| Type                 | Proves                                             | Required fields                       |
| -------------------- | -------------------------------------------------- | ------------------------------------- |
| `provider_receipt`   | The provider accepted or performed the operation   | `data` or `external_ref`              |
| `state_observation`  | A resulting state was observed after the operation | `subject`, `data`                     |
| `artifact`           | A produced artifact (file, screenshot, output)     | `content`                             |
| `signature`          | A signed statement by the producer                 | `signature`                           |
| `external_reference` | An independent system records the fact             | `external_ref`                        |
| `human_attestation`  | A human attests to a fact or decision              | `produced_by.actor`, `data.statement` |

## 4. Claims

A **claim** is what evidence establishes. v0.1 claims and the evidence types that can
support them:

| Claim       | Meaning                                        | Supporting types                                                           |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `execution` | The provider performed the requested operation | `provider_receipt`, `external_reference`, `signature`, `state_observation` |
| `delivery`  | Content reached its intended recipients        | `provider_receipt`, `state_observation`, `external_reference`              |
| `state`     | A resulting state is observable                | `state_observation`, `artifact`, `external_reference`                      |
| `approval`  | An accountable actor approved                  | `human_attestation`, `signature`                                           |

Evidence whose type cannot support one of its claims is invalid. Extension claims use
namespaced identifiers.

### 4.1 Required claims

The claims required for an execution to complete are the union of:

1. `evidence.require` in the request;
2. `evidence.require` obligations from policy;
3. `execution`, when the capability is mutating.

Each required claim MUST be supported by the capability (`evidence.claims`). A claim
enabled by a trait (for example `delivery` by `delivery_receipt`) makes that trait
required ([capabilities.md](capabilities.md)).

### 4.2 Evaluation

After a provider reports `completed`, the runtime MUST check that every required claim
is supported by at least one valid evidence document. If a claim is missing:

- for a **mutating** capability, the execution becomes `unknown` with
  `evidence_missing` — the effect may have happened and must be reconciled;
- for a **non-mutating** capability, the execution becomes `failed` with
  `evidence_missing`.

## 5. Integrity

The `digest` of a document is `sha256:` followed by the lowercase hexadecimal SHA-256
of its canonical JSON form (RFC 8785, JSON Canonicalization Scheme), computed with the
`digest` field removed. Receivers MAY recompute it to detect alteration. Signatures,
when used, MUST use standard formats; implementations MUST NOT invent cryptography.

## 6. Execution receipt

The receipt is the canonical, vendor-neutral, serializable and auditable record of an
execution.

```yaml
protocol: runtime/0.1
receipt:
  receipt_id: rcpt_01
  request_id: req_01
  execution_id: exec_01
  capability: { id: communication.send, version: 0.1.0 }
  profile: email
  traits: [delivery_receipt]
  provider: { id: example-provider, version: 1.0.0 }
  actor: { ref: identity://user/42 }
  authority: { decision: allow, ref: authority://company/support-manager, grant_id: support-email }
  policy: { decision: allow, refs: [policy://company/default] }
  credential_owner: organization
  status: completed
  created_at: 2026-01-01T00:00:00Z
  started_at: 2026-01-01T00:00:00Z
  completed_at: 2026-01-01T00:00:01Z
  duration_ms: 1000
  cost: { amount: 0.012, currency: USD }
  evidence: [evidence://ev_01, evidence://ev_02]
  events: [evt_01]
  issued_at: 2026-01-01T00:00:01Z
integrity:
  canonicalization: RFC8785
  digest: sha256:9d2b…
```

| Field              | Rule                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| `status`           | `completed`, `failed`, `cancelled`, `rejected` or `unknown`                       |
| `capability`       | Normalized identifier and resolved version; `requested_as` when an alias was used |
| `provider`         | Absent when the execution never reached a provider                                |
| `authority`        | Decision summary; always present                                                  |
| `policy`           | Decision summary; absent when authority denied                                    |
| `approval`         | Decision summary when approval was required                                       |
| `credential_owner` | Ownership class of the credential used; the reference is not recorded             |
| `error`            | Sanitized error for non-completed statuses ([errors.md](errors.md))               |
| `warnings`         | Non-fatal notices such as `deprecated_alias`                                      |
| `started_at`       | Dispatch time; absent when never dispatched                                       |
| `evidence`         | References to every evidence document of the execution                            |
| `events`           | Identifiers of events published for the execution                                 |
| `integrity.digest` | Digest of the canonical JSON of `receipt` (§5)                                    |

A runtime MUST issue a receipt when an execution reaches a terminal state and when it
enters `unknown`. A later receipt for the same execution supersedes earlier ones and
MUST keep the same `execution_id`.

Receipts MUST NOT contain secret material, credential references, vendor-specific
top-level fields or raw provider responses. Vendor detail MAY appear only under
namespaced `extensions`.
