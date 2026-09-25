# Capability Requests

| Field    | Value                                                               |
| -------- | ------------------------------------------------------------------- |
| Status   | Normative · Experimental                                            |
| Protocol | `runtime/0.1`                                                       |
| Scope    | `CapabilityRequest`, `Actor`, `Resource`, `Constraints`, validation |

Schemas: `capability-request`, `actor`, `resource`, `constraints`.

## 1. Document

```yaml
protocol: runtime/0.1
request_id: req_01
capability: { id: communication.send, version: "^0.1" }
profile: email
traits: { required: [delivery_receipt] }
actor: { ref: identity://user/42 }
authority: { ref: authority://company/support-manager }
input:
  recipients: [identity://customer/981]
  subject: Account update
  content: Your account has been updated.
constraints:
  timeout_ms: 30000
  max_cost: { amount: 0.05, currency: USD }
evidence: { require: [execution, delivery] }
```

| Field             | Required | Meaning                                                                                    |
| ----------------- | -------- | ------------------------------------------------------------------------------------------ |
| `protocol`        | yes      | `runtime/0.1`                                                                              |
| `request_id`      | yes      | Caller-chosen identifier, unique per actor                                                 |
| `capability`      | yes      | `id` (canonical or namespaced) and `version` range ([versioning.md](versioning.md))        |
| `profile`         | no       | One profile accepted by the capability                                                     |
| `traits`          | no       | `required` (hard) and `preferred` (ordering only) trait lists                              |
| `actor`           | yes      | Who is asking                                                                              |
| `authority`       | no       | The authority the actor invokes; when present only grants of that authority are considered |
| `resource`        | no       | The primary resource the capability acts upon                                              |
| `input`           | yes      | Capability input; validates against the effective input schema                             |
| `constraints`     | no       | Caller limits ([§4](#4-constraints))                                                       |
| `evidence`        | no       | `require`: evidence claims that must be proven for completion                              |
| `idempotency_key` | no       | Caller key identifying the intended effect across retries                                  |
| `credential`      | no       | Credential selector: `{ owner }` or `{ ref }` — a reference, never a secret                |
| `context`         | no       | `correlation_id`, `causation_id`, `trace_id` and string `labels`                           |
| `extensions`      | no       | Namespaced implementation data ([extensions.md](extensions.md))                            |

**No raw credential ever appears in a request.** Credentials are selected by
reference ([providers.md](providers.md)).

## 2. Actor

```yaml
actor:
  ref: identity://agent/support-agent
  type: agent # human | agent | service | system
  on_behalf_of: identity://user/42
```

`ref` is REQUIRED. Authority is always evaluated for `ref`. `on_behalf_of`, when
present, is recorded for audit; it never grants authority by itself.

## 3. Resource

```yaml
resource:
  ref: resource://crm/accounts/981
  type: account
```

`ref` is any absolute URI except `secret://`. `type` is a free-form hint.

When `resource` is absent and the capability input has a top-level `resource` reference,
that reference is the request resource for authority. When both are present they MUST
be equal (`invalid_request`, `detail: resource_mismatch`).

## 4. Constraints

| Field        | Meaning                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| `timeout_ms` | Maximum execution time, `1`–`3600000`. Default is runtime-defined (SHOULD be 30000). |
| `deadline`   | Absolute RFC 3339 time after which the execution MUST NOT start or continue          |
| `max_cost`   | Maximum cost; a provider without a cost estimate in the same currency is ineligible  |
| `providers`  | `allow`, `deny` and `prefer` lists of provider identifiers                           |
| `regions`    | `allow` list of region codes; providers must declare at least one allowed region     |

Constraints are checked deterministically during resolution; unsatisfiable constraints
fail with `constraint_unsatisfied`.

## 5. Validation

A runtime MUST validate every request **before** evaluating authority, in this order.
The first failing step determines the error.

| Step | Check                                                                       | Error                 |
| ---- | --------------------------------------------------------------------------- | --------------------- |
| 1    | Size ≤ runtime limit (default 1 MiB) and nesting depth ≤ 32                 | `invalid_request`     |
| 2    | `protocol` is supported                                                     | `unsupported_version` |
| 3    | Document validates against `capability-request` schema                      | `invalid_request`     |
| 4    | No raw secret in any field ([security.md](security.md))                     | `invalid_request`     |
| 5    | Capability identifier is well formed and respects namespace isolation       | `invalid_request`     |
| 6    | Capability exists (after deprecated alias normalization)                    | `unknown_capability`  |
| 7    | Registry version satisfies the requested range                              | `unsupported_version` |
| 8    | Profile exists and is accepted by the capability                            | `unsupported_profile` |
| 9    | Traits exist and effective required traits are declared by the capability   | `missing_trait`       |
| 10   | Evidence claims exist and are supported by the capability                   | `invalid_request`     |
| 11   | `input` validates against the effective input schema (capability ∧ profile) | `invalid_request`     |

Step 4 also rejects a credential selector whose `owner` differs from the owner segment
of its `ref` (`detail: credential_owner_mismatch`). Step 5 rejects identifiers that
write `core.`, use a reserved namespace word as a domain, or shadow a core capability
from an extension namespace (`detail: namespace_violation`).

Validation is deterministic: the same request against the same registry always yields
the same result.

## 6. Request identity

- A runtime MUST treat `(actor.ref, request_id)` as the identity of a request.
- Resubmitting an identical request MUST return the existing execution; it MUST NOT
  create a second execution.
- Resubmitting a different document with the same identity MUST fail with
  `invalid_request` (`detail: request_id_conflict`) and MUST NOT create an execution.

## 7. Idempotency

For mutating capabilities a runtime MUST forward an idempotency key to the provider.
When the caller omits `idempotency_key`, the runtime MUST derive one that is stable for
the request identity (for example `<actor.ref>/<request_id>`). The key identifies the
intended effect; it never authorizes repeating it ([execution.md](execution.md)).
