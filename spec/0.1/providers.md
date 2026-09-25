# Providers, Adapters, Credentials and Resolution

| Field    | Value                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Status   | Normative · Experimental                                                                                       |
| Protocol | `runtime/0.1`                                                                                                  |
| Scope    | `Provider`, `Adapter`, provider manifests, `CredentialRef`/BYOK, provider operations, deterministic resolution |

Schemas: `provider-manifest`, `binding`, `credential-ref`, `invocation`,
`provider-result`, `reconciliation`, `health`, `resolution`.

## 1. Provider and adapter

- A **Provider** is an executor identified by `provider.id` that declares, in a
  **provider manifest**, which capabilities it implements.
- An **Adapter** is the software that realizes a provider by translating protocol
  semantics to a concrete system:

```text
Runtime semantics
       ↓
Adapter boundary      ← CapabilityRequest semantics in, evidence out
       ↓
Vendor API / MCP server / CLI / local system
```

An adapter MAY run in-process with the runtime, as a local sidecar or container, or
as a standalone MCP or HTTP server. Adapters need no infrastructure from the vendor
whose system they call.

## 2. Provider manifest

```yaml
protocol: runtime/0.1
provider: { id: example-provider, version: 1.0.0, name: Example Provider }
adapter: { id: example-adapter, version: 1.0.0, system: example-mail-service }
implements:
  - capability: communication.send
    versions: ["^0.1"]
    profiles: [email]
    traits: [attachments, delivery_receipt, idempotency]
    evidence: { claims: [execution, delivery], types: [provider_receipt] }
    cost: { estimate: { amount: 0.001, currency: USD } }
    regions: [eu, us]
    reconciliation: supported
credentials: { required: true, accepts: [organization, runtime] }
bindings:
  - { type: http, ref: ./http-binding.yaml }
```

| Field                         | Rule                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `provider.id`                 | `^[a-z0-9][a-z0-9._-]{0,63}$`, stable across versions                                                                |
| `provider.version`            | Semantic version of the provider implementation                                                                      |
| `adapter`                     | Optional description of the realizing adapter; `system` MAY name a vendor — this is adapter metadata, not vocabulary |
| `implements[].capability`     | A registered capability identifier (core or namespaced)                                                              |
| `implements[].versions`       | Version ranges of the capability definition the provider implements                                                  |
| `implements[].profiles`       | Profiles supported; MUST be accepted by the capability                                                               |
| `implements[].traits`         | Traits supported; MUST include the capability's required traits and only declared traits                             |
| `implements[].evidence`       | Claims and evidence types the provider produces                                                                      |
| `implements[].risk`           | Optional risk that MAY raise, never lower, the capability default                                                    |
| `implements[].cost.estimate`  | Estimated cost per execution, used for `max_cost`                                                                    |
| `implements[].regions`        | Regions where execution and data processing occur                                                                    |
| `implements[].reconciliation` | `supported` or `unsupported` (default)                                                                               |
| `credentials.required`        | Whether a credential reference is needed to execute                                                                  |
| `credentials.accepts`         | Credential ownership classes the provider can use                                                                    |
| `bindings`                    | How the runtime reaches the provider: `in_process`, `http` or `mcp` ([bindings](../../bindings/))                    |

A manifest MUST NOT contain secret material. For every mutating capability it
implements, a provider MUST declare the `idempotency` trait, `reconciliation:
supported`, or both.

## 3. Credentials and BYOK

### 3.1 CredentialRef

```yaml
credential:
  ref: secret://organization/providers/example-production
  owner: organization
```

- `ref` has the form `secret://<owner>/<path>`, where `<owner>` is one of
  `organization`, `runtime`, `provider`, `workload`, `user`.
- `owner`, when present, MUST equal the owner segment of `ref`.
- A `CredentialRef` is a pointer. **API keys, tokens, passwords and private keys are
  never transported** in requests, manifests, invocations, results, evidence,
  receipts, events, errors or logs.

| Owner          | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| `organization` | Bring-your-own-key: the organization's own account with the system |
| `runtime`      | Managed: the runtime operator's account                            |
| `provider`     | The provider holds credentials itself; the runtime passes nothing  |
| `workload`     | A workload identity of the executing environment                   |
| `user`         | The actor's personal credential                                    |

Vaults, KMS, OAuth token stores and hardware modules are implementation details of the
credential broker.

### 3.2 Credential bindings

A runtime holds **credential bindings**: `{ provider, ref }` pairs configured by the
organization. Credential selection for a provider is deterministic:

1. If the request names `credential.ref`, it MUST be bound to the provider; nothing
   else is considered.
2. Else, if the request names `credential.owner`, only bindings with that owner are
   considered.
3. Else, bindings are considered in owner order `organization`, `workload`, `user`,
   `runtime`, `provider`, then by `ref` in code-point order.
4. The first binding whose owner is in `credentials.accepts` and whose reference the
   broker can resolve is selected.
5. When the request names no credential, a provider with `credentials.required: false`
   is eligible without a binding. A request that names `credential.ref` or
   `credential.owner` is served only through a selected binding, even by a provider
   that does not require one: a caller that asks for a specific account never runs on
   another account, or on none.

The selected owner is recorded in the receipt as `credential_owner`; the reference
itself is not.

### 3.3 Materialization

Secret material is materialized **only inside the adapter boundary, at dispatch time**,
through the credential broker available to the adapter's host. An adapter MUST NOT
store, log, echo or return secret material, and MUST NOT require hard-coded keys.

## 4. Provider operations

Transport-independent operations a provider exposes through its binding:

| Operation   | Input        | Output             | Purpose                                                                            |
| ----------- | ------------ | ------------------ | ---------------------------------------------------------------------------------- |
| `describe`  | —            | `ProviderManifest` | Declare capabilities                                                               |
| `execute`   | `Invocation` | `ProviderResult`   | Perform one authorized invocation                                                  |
| `reconcile` | `Invocation` | `Reconciliation`   | Establish the outcome of an `unknown` or `running` invocation without repeating it |
| `health`    | —            | `Health`           | Report availability; never a proof of authorization                                |

An **invocation** carries only what the provider needs: identifiers, the resolved
capability version, profile, effective traits, validated input, idempotency key,
deadline, the actor reference (for audit), the required evidence claims and a
credential _reference_. It never carries authority or policy decisions.

A **provider result** has `status`:

| Status      | Meaning                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| `completed` | The operation was performed; `output` and evidence are included                          |
| `failed`    | The operation was not performed; the provider has proof no effect occurred or will occur |
| `unknown`   | The provider cannot establish whether the effect occurred                                |
| `running`   | Accepted and still in progress; allowed only with the `async` trait                      |

A **reconciliation** has `status` `completed` (with evidence), `failed` (with
`final: true` and evidence that no effect occurred or will occur) or `inconclusive`.

## 5. Adapter rules

An adapter admitted by a runtime MUST:

1. **Handle secrets transparently** — consume only `CredentialRef`s, materialized by
   the broker at dispatch; never store, log or hard-code keys.
2. **Prove, not assert** — return evidence for every claim it reports; `completed`
   without evidence is not completion.
3. **Respect the unknown** — report `unknown` when a network call fails or times out
   after dispatch; never invite duplicate retries; accept `idempotency_key`.
4. **Respect schemas** — validate input and produce output exactly as the capability's
   `input` and `output` schemas define.
5. **Isolate namespaces** — expose behaviour absent from the core vocabulary only under
   `community.<author>.*` or `vendor.<vendor>.*`.

Admission is a deterministic pipeline:

```text
Adapter + ProviderManifest
  → conformance suite (schemas, BYOK, receipts, evidence, error handling)
  → provider registry
  → deterministic provider resolution
```

## 6. Resolution

Resolution selects providers for an authorized request. It MUST be deterministic:
the same registry, providers, credential bindings, policy obligations and request
always produce the same result.

### 6.1 Checks per provider

For each registered provider, checks run in this order; the first failure rejects the
provider with that stage's code:

| Stage | Check                                                                                | Rejection code           |
| ----- | ------------------------------------------------------------------------------------ | ------------------------ |
| 1     | Implements the (normalized) capability                                               | `provider_unavailable`   |
| 2     | A declared version range contains the resolved registry version                      | `unsupported_version`    |
| 3     | Supports the requested profile, if any                                               | `unsupported_profile`    |
| 4     | Supports every effective required trait                                              | `missing_trait`          |
| 5     | Authority does not restrict the provider (grant `providers` lists)                   | `authority_denied`       |
| 6     | Policy obligations and provider-scoped policy rules allow the provider               | `policy_denied`          |
| 7     | Constraints are satisfied: `providers.allow/deny`, `regions`, `max_cost`, `deadline` | `constraint_unsatisfied` |
| 8     | A credential can be selected (§3.2)                                                  | `credential_unavailable` |
| 9     | The provider is not known to be unavailable                                          | `provider_unavailable`   |

### 6.2 Ordering

Eligible providers are ordered by:

1. position in `constraints.providers.prefer` (listed providers first, in list order);
2. number of `traits.preferred` supported, descending;
3. `provider.id`, ascending by code point;
4. `provider.version`, descending by semantic version precedence.

The runtime selects the first eligible provider. If binding it fails **before
dispatch** (credential not materializable, provider unreachable), the runtime MAY try
the next eligible provider. After dispatch it MUST NOT fall back automatically.

### 6.3 Result and failure

A resolution result lists `eligible` providers in order and `rejected` providers with
their reasons. When no provider is eligible the request is rejected with the code of
the **latest stage** reached by any provider — the rejection closest to eligibility.
When no provider is registered at all, the code is `provider_unavailable`.

Language models MAY help diagnose resolution failures but MUST NOT influence
eligibility or ordering.
