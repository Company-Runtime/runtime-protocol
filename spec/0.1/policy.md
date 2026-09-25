# Policy, Risk and Approval

| Field    | Value                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Status   | Normative · Experimental                                                 |
| Protocol | `runtime/0.1`                                                            |
| Scope    | The minimal policy contract, the portable policy set, risk and approvals |

Schemas: `policy-set`, `policy-decision`, `approval-decision`.

## 1. Question

Policy answers:

> Under which rules may this authorized action occur?

Policy is evaluated after authority allows a request and before provider resolution.
v0.1 defines a **minimal contract**, not a complete policy language. Runtimes MAY use
any policy engine that produces a `policy-decision` with the semantics below.

## 2. Decision contract

```yaml
protocol: runtime/0.1
decision: require_approval # allow | deny | require_approval
policy_refs: [policy://company/default]
matched_rules: [approve-high-risk]
reason: high-risk capabilities require approval
obligations:
  approvers: [identity://user/founder]
  providers: { deny: [legacy-provider] }
evaluated_at: 2026-01-01T00:00:00Z
```

| Decision           | Effect                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| `allow`            | The execution becomes `authorized`                                            |
| `deny`             | The request is rejected with `policy_denied`                                  |
| `require_approval` | The execution waits in `awaiting_approval` until an approval decision arrives |

**Obligations** constrain what happens next. v0.1 obligations:

| Obligation         | Meaning                                                    |
| ------------------ | ---------------------------------------------------------- |
| `providers.allow`  | Only these providers are eligible                          |
| `providers.deny`   | These providers are ineligible                             |
| `regions.allow`    | Only providers declaring one of these regions are eligible |
| `evidence.require` | Additional evidence claims required for completion         |
| `approvers`        | Identities allowed to decide an approval                   |

A runtime MUST enforce every obligation it receives; an obligation it does not
understand MUST cause `deny`.

## 3. Portable policy set

```yaml
protocol: runtime/0.1
id: policy://company/default
version: 1
default: allow
rules:
  - id: approve-high-risk
    match: { risk: { at_least: high } }
    effect: require_approval
    obligations: { approvers: [identity://user/founder] }
  - id: no-legacy-provider
    match: { capabilities: ["communication.*"], providers: [legacy-provider] }
    effect: deny
  - id: eu-data
    match: { capabilities: ["knowledge.*"] }
    effect: allow
    obligations: { regions: { allow: [eu] } }
```

- `default` is REQUIRED (`allow`, `deny` or `require_approval`). There is no implicit
  default.
- `match` fields are conjunctive; an absent field matches anything:
  `capabilities` and `actors` (patterns, see [authority.md](authority.md)),
  `profiles`, `mutating` (boolean), `risk` (`at_least` and/or `at_most`) and
  `providers` (provider identifiers).

### 3.1 Evaluation

1. **Request-level rules** are the rules without `match.providers`. Collect every
   request-level rule that matches the request, using the capability's default risk.
2. If none matches, the decision is `default`, with no obligations.
3. Otherwise the decision is the strongest matching effect:
   `deny` > `require_approval` > `allow`.
4. Obligations of all matching rules whose effect equals the decision are merged:
   `providers.allow` and `regions.allow` by intersection, `providers.deny`,
   `evidence.require` and `approvers` by union.
5. **Provider-scoped rules** (with `match.providers`) are applied during resolution:
   a provider matched by a `deny` rule is ineligible (`policy_denied`). A
   provider-scoped rule MUST NOT require approval in v0.1.
6. The provider's declared risk MAY raise the effective risk during resolution. The
   request-level rules are re-evaluated with that risk; a provider for which the
   result is stronger than the request-level decision is ineligible
   (`policy_denied`).

Evaluation is deterministic; rule order affects only the order of `matched_rules`.

## 4. Risk

Risk levels, in increasing order:

```text
none < low < medium < high < critical
```

- A capability declares `risk.default`. A provider MAY raise it for its
  implementation; nothing may lower it.
- **Risk never determines approval automatically.** Only policy can require approval.

## 5. Approval

When policy requires approval, the runtime records an approval request and the
execution waits in `awaiting_approval`. An approval decision:

```yaml
protocol: runtime/0.1
execution_id: exec_01
decision: approved # approved | rejected
decided_by: { ref: identity://user/founder }
decided_at: 2026-01-01T00:05:00Z
rationale: Customer requested the change in ticket 1234.
```

- If obligations name `approvers`, `decided_by.ref` MUST match one of them.
- Otherwise the approver MUST hold authority for `approval.decide`, evaluated like any
  other request ([authority.md](authority.md)).
- An approval MUST come from an actor other than the requesting actor.
- `approved` moves the execution to `authorized`. `rejected` rejects it with
  `policy_denied` (`detail: approval_rejected`).
- The decision is recorded as `human_attestation` evidence with the `approval` claim
  and summarized in the receipt.
