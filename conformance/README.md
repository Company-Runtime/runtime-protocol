# Conformance

The language-neutral conformance suite of the Runtime Protocol v0.1. The normative
description is [spec/0.1/conformance.md](../spec/0.1/conformance.md).

| Path                       | Content                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| [`suite.yaml`](suite.yaml) | Suite index, version and required categories                          |
| `cases/document/`          | Document-level cases, executed by this repository's tooling           |
| `cases/state-machine.yaml` | Execution state transitions an implementation must allow and refuse   |
| `cases/resolution/`        | Deterministic provider resolution, with rejection reasons             |
| `cases/runtime/`           | Full pipeline cases, including the end-to-end smoke scenario          |
| `fixtures/`                | Requests, scripted providers, authority grants, policy sets, overlays |
| `schemas/`                 | JSON Schemas of cases and scripted provider fixtures                  |

Run the document-level cases and validate the whole suite with:

```bash
pnpm run validate:conformance
```

Runtime-level cases need an implementation. A runner loads each case, builds a runtime
with the given scripted providers, authority, policy, credential bindings and secrets,
submits the request, applies the `then` actions and compares the result with `expect`.
The reference runner ships with the reference SDK.
