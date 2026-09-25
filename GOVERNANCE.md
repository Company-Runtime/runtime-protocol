# Governance

The Runtime Protocol is governed so that its vocabulary stays **small, stable,
intent-based and vendor-neutral**. Humans govern; deterministic tooling enforces; AI
advises.

## 1. Principles

- The [semantic constitution](spec/0.1/semantics.md) prevails over any other document,
  implementation or convenience.
- The protocol must remain implementable by third parties even if no particular runtime
  product exists. No product, vendor or implementation has special standing.
- Normative decisions — authority, policy, conformance, schema validity, naming,
  promotion — are deterministic and reproducible.
- Language models MAY suggest collisions, draft collision analyses or summarize
  discussions. They MUST NOT approve, merge, promote or decide conformance.

## 2. Roles

| Role              | Responsibility                                                                   |
| ----------------- | -------------------------------------------------------------------------------- |
| Contributor       | Anyone proposing issues, RFCs, extensions, fixtures or fixes                     |
| Semantic reviewer | Reviews vocabulary changes against the constitution; performs collision analysis |
| Maintainer        | Merges changes, runs the RFC process, keeps CI and tooling healthy               |

Maintainers and semantic reviewers are listed in `.github/CODEOWNERS`. A change to
`spec/`, `schemas/` or `registry/` requires approval from a semantic reviewer who is
not its author. Merging is always a human action.

## 3. What requires an RFC

| Change                                                                 | RFC required                         |
| ---------------------------------------------------------------------- | ------------------------------------ |
| New top-level primitive                                                | Yes                                  |
| New core domain or canonical verb                                      | Yes                                  |
| Promotion of a capability, profile or trait to `candidate` or `stable` | Yes                                  |
| Breaking change to a capability, schema or binding                     | Yes                                  |
| New protocol version                                                   | Yes                                  |
| New `experimental.*` capability, profile or trait                      | No — proposal with the ten questions |
| New conformance fixture, example, editorial fix                        | No                                   |
| Registration of a `community.*` or `vendor.*` extension                | No — must pass the semantic lint     |

## 4. Vocabulary lifecycle

```text
Extension → Experimental → RFC → Collision Analysis
→ Independent Implementations → Real Usage
→ Semantic Review → Candidate → Stable
```

| Status         | Entry criteria                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `experimental` | Proposal answers the ten questions; passes the semantic lint; no deterministic failure                                             |
| `candidate`    | Accepted RFC; written collision analysis; at least **two independent implementations** passing conformance; evidence of real usage |
| `stable`       | Candidate for at least one minor protocol version without breaking changes; semantic review sign-off                               |
| `deprecated`   | Replacement named; removal no earlier than the next minor protocol version                                                         |

Every definition starts `experimental`. Promotion stops for any primitive whose
semantics are not clearly justified.

## 5. RFC process

```text
Issue / Proposal → RFC PR → experimental.* → real implementations
→ semantic review → candidate → core / stable
```

1. Open an issue describing the intent.
2. Open a pull request adding `rfcs/NNNN-short-title.md` from the
   [template](rfcs/0000-template.md).
3. The RFC is discussed publicly for at least 14 days.
4. Maintainers record the decision (`accepted`, `rejected`, `withdrawn`) in the RFC.
5. Accepted RFCs are implemented in follow-up pull requests that reference them.

## 6. Merge gate

A pull request is mergeable only when CI is green — format, schema validation,
registry validation, semantic lint, compatibility check, conformance, examples and
docs — and a human reviewer approved it. Deterministic failures block merging.
Similarity findings (`SL008`, `SL010`) require an explicit human decision recorded in
the pull request.

## 7. Scope boundary

This repository holds only what another organization could implement or use without
adopting any particular product: specifications, schemas, the registry, bindings,
RFCs, conformance fixtures and deterministic tooling. Product features, tenant
management, billing, private business logic, internal agents, databases and
credentials never belong here. Real secrets belong to no repository.
