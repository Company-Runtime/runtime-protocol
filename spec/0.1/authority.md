# Authority

| Field    | Value                                                     |
| -------- | --------------------------------------------------------- |
| Status   | Normative · Experimental                                  |
| Protocol | `runtime/0.1`                                             |
| Scope    | Authority semantics, the portable grant format, decisions |

Schemas: `authority-grants`, `authority-decision`.

## 1. Question

Authority answers exactly one question:

> May this **Actor** request this **Capability** over this **Resource** in this
> **Context**?

It is evaluated **after** validation and **before** policy, resolution and any
provider invocation. It is **deny-by-default**: an actor without a matching grant is
denied.

Authority is not policy. Authority decides _who may ask_; policy decides _under which
rules an allowed request may proceed_ ([policy.md](policy.md)).

## 2. Requirements

A runtime MUST:

1. establish, through the binding, that the authenticated caller may act as
   `actor.ref` — a request cannot grant itself an identity;
2. evaluate authority for every request, before any provider is contacted;
3. deny when no grant matches, when the evaluator fails, or when the evaluator is
   absent;
4. record the decision (`allow` or `deny`, the authority reference and the matching
   grant) in the execution and in the receipt;
5. never pass authority decisions or grants to providers;
6. never let a provider, a language model or a request field widen a decision.

Runtimes MAY use any authority system (role-based, attribute-based, delegation
chains) as long as it produces an `authority-decision` with these properties.

## 3. Portable grant format

v0.1 defines a minimal, deterministic grant format so that authority can be exchanged
and tested across implementations:

```yaml
protocol: runtime/0.1
grants:
  - id: support-agent-email
    authority: authority://company/support-manager
    subjects: [identity://agent/support-agent]
    capabilities: [communication.send, knowledge.search]
    profiles: [email]
    resources: ["resource://crm/*"]
    providers: [example-provider]
    valid_from: 2026-01-01T00:00:00Z
    valid_until: 2027-01-01T00:00:00Z
```

| Field                       | Required | Matching rule                                                                                |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `id`                        | yes      | Identifies the grant in decisions                                                            |
| `authority`                 | yes      | The authority the grant belongs to                                                           |
| `subjects`                  | yes      | Patterns matched against `actor.ref`                                                         |
| `capabilities`              | yes      | Patterns matched against the normalized capability identifier                                |
| `profiles`                  | no       | When present, the request profile MUST be listed; a request without profile does not match   |
| `resources`                 | no       | When present, `resource.ref` MUST match a pattern; a request without resource does not match |
| `providers`                 | no       | When present, only these providers may be resolved (resolution stage 5)                      |
| `valid_from`, `valid_until` | no       | The evaluation time MUST fall within the interval                                            |

**Patterns** are exact strings, or strings ending in `*` that match any suffix
(`identity://agent/*`, `communication.*`). A lone `*` matches everything and SHOULD NOT
be used. Matching is case-sensitive and code-point based.

## 4. Evaluation

Given a request and a grant set, at evaluation time `t`:

1. If the request names `authority.ref`, only grants whose `authority` equals it are
   considered. If none of them lists the actor as a subject, the decision is `deny`
   with reason `authority_not_held`.
2. A grant matches when `subjects`, `capabilities`, `profiles`, `resources` and the
   validity interval all match.
3. If one or more grants match, the decision is `allow` and the **first matching grant
   in document order** is recorded.
4. Otherwise the decision is `deny` with reason `no_matching_grant`.

The result is fully determined by the request, the grant set and `t`.

## 5. Decision

```yaml
protocol: runtime/0.1
decision: allow
authority: authority://company/support-manager
grant_id: support-agent-email
reason: grant support-agent-email matched
evaluated_at: 2026-01-01T00:00:00Z
```

A `deny` decision rejects the request with `authority_denied`. The error MUST NOT
disclose other grants, subjects or resources.
