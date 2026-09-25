# HTTP Binding — `http/0.1`

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Status   | Normative · Experimental                   |
| Protocol | `runtime/0.1`                              |
| Contract | [openapi.yaml](openapi.yaml) (OpenAPI 3.1) |

## 1. Conventions

- Bodies are JSON (`application/json; charset=utf-8`).
- Every request and response carries the header `Runtime-Protocol: runtime/0.1`. A
  runtime MUST answer a request declaring another version with `400` and
  `unsupported_version`.
- The caller MUST be authenticated by the transport (for example OAuth 2.0 bearer
  tokens or mutual TLS). The runtime MUST verify that the authenticated principal may
  act as `actor.ref` before evaluating authority; otherwise it answers `403` with
  `authority_denied`. Transport credentials authenticate the caller; they are never
  provider credentials and never appear in protocol documents.
- Requests larger than the runtime limit are answered `413` with `invalid_request`.

## 2. Runtime API

| Method and path                             | Body                | Response                                      |
| ------------------------------------------- | ------------------- | --------------------------------------------- |
| `GET /.well-known/runtime`                  | —                   | Discovery document                            |
| `POST /executions`                          | `CapabilityRequest` | Execution envelope                            |
| `GET /executions/{execution_id}`            | —                   | Execution envelope                            |
| `POST /executions/{execution_id}/approval`  | `ApprovalDecision`  | Execution envelope                            |
| `POST /executions/{execution_id}/cancel`    | —                   | Execution envelope                            |
| `POST /executions/{execution_id}/reconcile` | —                   | Execution envelope                            |
| `GET /executions/{execution_id}/receipt`    | —                   | `ExecutionReceipt` (`404` until one exists)   |
| `GET /evidence/{evidence_id}`               | —                   | `Evidence`                                    |
| `POST /resolutions`                         | `CapabilityRequest` | Resolution result (dry run; nothing executes) |

An **execution envelope** is:

```json
{
  "protocol": "runtime/0.1",
  "execution": { "execution_id": "exec_01", "state": "completed", "…": "…" },
  "receipt": { "protocol": "runtime/0.1", "receipt": { "…": "…" }, "integrity": { "…": "…" } },
  "error": { "code": "…", "message": "…", "retryable": false }
}
```

`receipt` is present once the execution is terminal or `unknown`; `error` is present
when the execution did not complete.

### 2.1 `POST /executions`

- Submitting the same request identity (`actor.ref`, `request_id`) returns the existing
  execution; `POST /executions` is idempotent.
- By default the runtime answers when the execution settles or its timeout elapses.
  With `Prefer: respond-async` it MAY answer `202` as soon as the execution exists.
- Responses to settled or pending executions carry `Location: /executions/{id}`.
- An `Idempotency-Key` header, when present, MUST equal the body's `idempotency_key`
  (or is copied into it when the body has none).

### 2.2 Status codes

| Execution state or error                                           | HTTP status                                      |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| `completed`                                                        | `200`                                            |
| `pending`, `awaiting_approval`, `authorized`, `running`, `unknown` | `202`                                            |
| `invalid_request`                                                  | `400` (`413` for oversized bodies)               |
| `unknown_capability`                                               | `422`                                            |
| `unsupported_version`                                              | `422` (`400` for an unsupported protocol header) |
| `unsupported_profile`                                              | `422`                                            |
| `missing_trait`                                                    | `422`                                            |
| `constraint_unsatisfied`                                           | `422`                                            |
| `authority_denied`                                                 | `403`                                            |
| `policy_denied`                                                    | `403`                                            |
| `credential_unavailable`                                           | `503`                                            |
| `provider_unavailable`                                             | `503`                                            |
| `execution_failed`                                                 | `502`                                            |
| `evidence_missing`                                                 | `502`                                            |
| `timeout`                                                          | `504`                                            |
| `cancelled`                                                        | `409`                                            |

`unknown` is answered `202`: the outcome is not established, and the caller must not
resubmit; it follows the execution or asks for reconciliation.

## 3. Provider API

A remote provider (sidecar, container, standalone service) exposes:

| Method and path                               | Body         | Response           |
| --------------------------------------------- | ------------ | ------------------ |
| `GET /.well-known/runtime-provider`           | —            | `ProviderManifest` |
| `POST /invocations`                           | `Invocation` | `ProviderResult`   |
| `POST /invocations/{invocation_id}/reconcile` | `Invocation` | `Reconciliation`   |
| `GET /health`                                 | —            | `Health`           |

- The runtime authenticates to the provider with transport credentials; the provider
  materializes the invocation's `credential.ref` with its own credential broker.
- A provider answers `200` with a `ProviderResult` for every invocation it received,
  including `failed` and `unknown` results. Transport-level failures (connection
  refused before sending) mean the invocation was not received.
- A runtime that loses the response after sending MUST treat a mutating invocation as
  `unknown` and reconcile it; it MUST NOT resend it.

## 4. Discovery

`GET /.well-known/runtime` returns the discovery document of
[spec/0.1/discovery.md](../../spec/0.1/discovery.md). It is public metadata and MUST
NOT reveal secrets, credential references, grants, policies or tenant data.
