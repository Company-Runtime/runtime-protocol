# Security Requirements

| Field    | Value                                 |
| -------- | ------------------------------------- |
| Status   | Normative · Experimental              |
| Protocol | `runtime/0.1`                         |
| Scope    | Mandatory security properties of v0.1 |

## 1. Mandatory properties

| Property               | Requirement                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential references  | Secrets are referenced with `CredentialRef` (`secret://…`) and never transported ([providers.md](providers.md))                                                                     |
| Actor binding          | Before evaluating authority, the runtime establishes that the authenticated caller may act as `actor.ref`; the mechanism is binding-specific ([bindings](../../bindings/README.md)) |
| Deny-by-default        | Authority denies unless a grant matches ([authority.md](authority.md))                                                                                                              |
| Schema validation      | Every received document is validated against its schema before use                                                                                                                  |
| Timeouts               | Every invocation has a deadline; default 30 s, maximum 1 h                                                                                                                          |
| Payload limits         | Requests larger than the runtime limit (default 1 MiB) or nested deeper than 32 levels are rejected                                                                                 |
| Sanitized errors       | Errors never contain secrets, credential references, stack traces or raw provider responses                                                                                         |
| Traceability           | Executions and receipts carry request and execution identifiers, actor, capability, provider, policy and evidence references, timestamps and status                                 |
| No custom cryptography | Integrity uses SHA-256 over RFC 8785 canonical JSON; signatures use standard formats                                                                                                |

## 2. Raw secret rejection

A runtime MUST reject (`invalid_request`, `detail: raw_secret`) any request, manifest
or provider result that contains secret material. Detection is deterministic and
applies to every string value:

1. **Sensitive keys** — an object key that, lower-cased with `-` and `_` removed, is
   one of `apikey`, `accesstoken`, `refreshtoken`, `authtoken`, `bearertoken`,
   `token`, `secret`, `clientsecret`, `password`, `passwd`, `privatekey`,
   `authorization`, `sessiontoken` or `credentials`, holding a string that is not a
   `secret://` reference.
2. **Known secret formats** — a string value matching any of:

| Format                | Pattern                                                           |
| --------------------- | ----------------------------------------------------------------- |
| PEM private key       | `-----BEGIN [A-Z ]*PRIVATE KEY-----`                              |
| Bearer credential     | `^Bearer [A-Za-z0-9._~+/=-]{16,}$`                                |
| JSON Web Token        | `^eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$` |
| Prefixed API key      | `^(sk\|pk\|rk)-[A-Za-z0-9_-]{16,}$`                               |
| Access key identifier | `^(AKIA\|ASIA)[A-Z0-9]{16}$`                                      |
| Chat platform token   | `^xox[abpors]-[A-Za-z0-9-]{10,}$`                                 |
| Code host token       | `^(ghp\|gho\|ghu\|ghs\|ghr\|glpat)[-_][A-Za-z0-9_]{16,}$`         |
| Credentials in URL    | `^[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s@]+@`                        |

The list is a floor, not a ceiling: runtimes SHOULD detect more. Detection results
MUST NOT echo the detected value.

## 3. Credential handling

- The credential broker materializes secrets only inside the adapter boundary, only at
  dispatch time, and only for the selected provider.
- Materialized secrets MUST NOT be persisted in executions, evidence, receipts, events
  or logs. A runtime MUST redact any occurrence of a materialized secret from provider
  errors before recording them.
- Credential references are recorded only in executions visible to the organization
  that owns them; receipts record only `credential_owner`.

## 4. Language models

Language models MAY assist semantic analysis. They MUST NOT decide authority, policy,
conformance, resolution or promotion, and MUST NOT receive credential material.

## 5. Reporting vulnerabilities

See [SECURITY.md](../../SECURITY.md).
