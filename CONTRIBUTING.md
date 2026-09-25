# Contributing

Thank you for helping shape the Runtime Protocol. This repository is normative: a
change here changes what every implementation must do. Please read the
[semantic constitution](spec/0.1/semantics.md) and [GOVERNANCE.md](GOVERNANCE.md)
first.

## What you can propose

- capabilities, profiles and traits;
- semantic RFCs;
- bindings;
- schemas;
- conformance fixtures and tests;
- editorial fixes.

What does **not** belong here: product UIs, tenant or user management, billing,
implementations of organization models, internal agents, production credentials,
private business logic and product databases.

## Before proposing a capability

Try, in order:

1. **Reuse** an existing capability.
2. A **profile** — same intent, different context.
3. A **trait** — same intent, optional behaviour.
4. A **recipe** — a composition of existing capabilities.

Only when all four fail is a new capability justified. The proposal must answer the
ten questions:

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

New vocabulary starts in `experimental.*` or with status `experimental`, with the
answers in `proposal.md` next to the definition.

## Local checks

Requirements: Node.js ≥ 22.18 and pnpm 10.

```bash
pnpm install
pnpm run ci
```

`pnpm run ci` runs, in order: format check, schema validation, registry validation,
semantic lint, compatibility check, conformance validation, examples validation and
docs validation. The same pipeline runs in CI; deterministic failures block merging.

## Pull requests

- Keep each pull request focused on one change; avoid opportunistic refactors.
- Use [Conventional Commits](https://www.conventionalcommits.org/) with the scope
  `protocol` (for example `feat(protocol): add experimental.work.claim`).
- Update the specification, schemas, registry, examples and conformance fixtures
  together — documentation must reflect exactly what is defined.
- Add an entry to [CHANGELOG.md](CHANGELOG.md) under "Unreleased".

## Licensing

Contributions are accepted under the [Apache License 2.0](LICENSE).
