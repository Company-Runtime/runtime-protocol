# Runtime Protocol

The Runtime Protocol is an open, vendor-neutral contract for asking a runtime to
**do something on someone's behalf** and getting back **proof that it happened**.

A caller declares an _intent_ (`communication.send`), not an implementation
(`slack.send-message`). The runtime validates the request, checks authority and
policy, resolves a compatible provider, binds credentials by reference, executes,
collects evidence and returns a canonical execution receipt:

```text
Intent → Capability Request → Semantic Validation → Authority → Policy
→ Provider Resolution → CredentialRef/BYOK → Binding → Execution
→ Evidence → Execution Receipt
```

The fundamental test of the architecture: it must be possible to swap

```text
OpenAI ↔ Anthropic ↔ local model
Slack ↔ Teams ↔ email
GitHub ↔ GitLab
REST ↔ MCP
managed credentials ↔ BYOK
```

without changing the intent declared by the caller.

## Status

| Item             | Value                                          |
| ---------------- | ---------------------------------------------- |
| Protocol version | `runtime/0.1`                                  |
| Maturity         | **Experimental** — every primitive starts here |
| License          | [Apache License 2.0](LICENSE)                  |
| Governance       | [GOVERNANCE.md](GOVERNANCE.md) · [RFCs](rfcs/) |

This repository is the **normative source of truth**. Implementations live elsewhere
and must follow what is written here — never the other way around.

## Repository map

| Path                                             | Content                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`spec/0.1/`](spec/0.1/)                         | Normative specification (start with [`protocol.md`](spec/0.1/protocol.md))       |
| [`spec/0.1/semantics.md`](spec/0.1/semantics.md) | The semantic constitution — the twelve principles every change must respect      |
| [`schemas/0.1/`](schemas/0.1/)                   | JSON Schemas (Draft 2020-12) for every exchanged document                        |
| `registry/`                                      | The canonical semantic registry: domains, verbs, capabilities, profiles, traits  |
| `bindings/`                                      | Transport bindings: HTTP, MCP and events                                         |
| `extensions/`                                    | Registered extensions in the `experimental`, `community` and `vendor` namespaces |
| `recipes/`                                       | Example compositions of capabilities (recipes are not primitives)                |
| [`examples/`](examples/)                         | Valid example documents                                                          |
| [`rfcs/`](rfcs/)                                 | Proposals that change the protocol                                               |
| `conformance/`                                   | Language-neutral conformance suite and fixtures                                  |
| [`tooling/`](tooling/)                           | Deterministic validators: schemas, registry, semantic lint, compatibility, docs  |

## Ecosystem

```text
runtime-protocol   = source of truth (this repository)
runtime-sdk        = reference implementation
runtime-adapters   = official adapters
```

The protocol must keep making sense — and stay implementable by third parties —
even if no particular product built on top of it exists. Nothing in this repository
depends on any runtime product, vendor, model or transport.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). New capabilities, profiles and traits follow
the lifecycle in [GOVERNANCE.md](GOVERNANCE.md) and must answer the ten questions of
the capability proposal template.
