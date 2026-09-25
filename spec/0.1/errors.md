# Errors

| Field    | Value                                  |
| -------- | -------------------------------------- |
| Status   | Normative · Experimental               |
| Protocol | `runtime/0.1`                          |
| Scope    | Error codes, error documents, warnings |

Schema: `error`.

## 1. Error document

```yaml
protocol: runtime/0.1
error:
  code: authority_denied
  message: The actor is not authorized to request this capability.
  retryable: false
  stage: authority
  detail: no_matching_grant
  execution_id: exec_01
  request_id: req_01
```

| Field                        | Rule                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `code`                       | One of the codes below                                                                |
| `message`                    | Human-readable, sanitized ([security.md](security.md)), at most 512 characters        |
| `retryable`                  | Whether resubmitting the same request unchanged may succeed                           |
| `stage`                      | `validation`, `authority`, `policy`, `resolution`, `binding`, `execution`, `evidence` |
| `detail`                     | Optional machine-readable refinement, `^[a-z][a-z0-9_]*$`                             |
| `execution_id`, `request_id` | Present when known                                                                    |

## 2. Codes

| Code                     | Stage      | Meaning                                                            | Retryable | Execution state        |
| ------------------------ | ---------- | ------------------------------------------------------------------ | --------- | ---------------------- |
| `invalid_request`        | validation | Malformed, oversized, schema-invalid or secret-bearing request     | no        | `rejected`             |
| `unknown_capability`     | validation | The capability does not exist in the registry                      | no        | `rejected`             |
| `unsupported_version`    | validation | Protocol or capability version not supported                       | no        | `rejected`             |
| `unsupported_profile`    | validation | Profile unknown or not accepted by the capability or any provider  | no        | `rejected`             |
| `missing_trait`          | validation | A required trait is not declared by the capability or any provider | no        | `rejected`             |
| `authority_denied`       | authority  | Deny-by-default authority refused the request                      | no        | `rejected`             |
| `policy_denied`          | policy     | Policy refused the request, or an approval was rejected            | no        | `rejected`             |
| `constraint_unsatisfied` | resolution | No provider satisfies the constraints                              | no        | `rejected`             |
| `credential_unavailable` | binding    | No usable credential reference for any eligible provider           | yes       | `rejected`             |
| `provider_unavailable`   | resolution | No provider implements the capability, or none is reachable        | yes       | `rejected` or `failed` |
| `execution_failed`       | execution  | The provider failed, or its output was invalid                     | no        | `failed` or `unknown`  |
| `evidence_missing`       | evidence   | Required evidence claims were not proven                           | no        | `failed` or `unknown`  |
| `timeout`                | execution  | The timeout or deadline elapsed                                    | yes       | `failed` or `unknown`  |
| `cancelled`              | execution  | The execution was cancelled                                        | no        | `cancelled`            |

The stage column gives the stage at which the code is normally raised; resolution
failures reuse validation codes (`unsupported_profile`, `missing_trait`) when every
provider was rejected at that stage.

An execution in `unknown` is never retryable by resubmission: its outcome must be
reconciled ([execution.md](execution.md)).

## 3. Warnings

Warnings are non-fatal and appear in executions and receipts as
`{ code, message }`:

| Code                    | Meaning                                                |
| ----------------------- | ------------------------------------------------------ |
| `deprecated_alias`      | The request used a deprecated alias; it was normalized |
| `deprecated_capability` | The capability is `deprecated`                         |

## 4. Rules

- Errors MUST NOT contain secret material, credential references, stack traces or raw
  provider responses.
- Errors MUST NOT disclose authority grants, policy rules or other actors' data beyond
  the rule identifiers the actor is allowed to see.
- Bindings map codes to transport status codes but MUST NOT invent codes.
