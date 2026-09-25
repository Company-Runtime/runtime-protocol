# Discovery

| Field    | Value                                            |
| -------- | ------------------------------------------------ |
| Status   | Normative · Experimental                         |
| Protocol | `runtime/0.1`                                    |
| Scope    | Discovering runtimes, providers and the registry |

Schemas: `discovery`, `provider-manifest`.

## 1. Runtime discovery

A runtime describes itself with a **discovery document**. Over HTTP it is served at
`GET /.well-known/runtime` ([HTTP binding](../../bindings/http/README.md)).

```yaml
protocol: runtime/0.1
runtime: { id: example-runtime, version: 0.1.0, name: Example Runtime }
protocols: [runtime/0.1]
registry: { version: "0.1", digest: sha256:… }
capabilities:
  - id: communication.send
    version: 0.1.0
    profiles: [email, chat]
    traits: [attachments, delivery_receipt, idempotency]
  - id: knowledge.search
    version: 0.1.0
    profiles: []
    traits: []
bindings:
  - { type: http, version: "0.1", endpoint: https://runtime.example/ }
  - { type: mcp, version: "0.1", transport: stdio }
  - { type: events, version: "0.1", format: cloudevents/1.0 }
limits: { max_request_bytes: 1048576, max_timeout_ms: 3600000 }
extensions: { namespaces: [vendor.example] }
```

- `capabilities` lists what the runtime can currently resolve — the union of its
  providers' support — per capability version.
- A discovery document MUST NOT reveal secrets, credential references, authority
  grants, policy rules, provider credentials or tenant data.
- A runtime MAY tailor the document to the requesting actor, but MUST NOT advertise a
  capability it would reject for every actor.

## 2. Provider discovery

A remote provider serves its manifest at `GET /.well-known/runtime-provider` (HTTP
binding) or through the MCP binding. In-process providers expose the manifest through
their SDK. Runtimes MUST validate a manifest before registering the provider.

## 3. Registry discovery

The canonical registry lives in `registry/` of this repository. Machine consumers
SHOULD read `registry/graph.json`, a deterministic graph of all definitions and
relations ([capabilities.md](capabilities.md)). A future standalone registry service
MAY serve the same content; its absence never blocks an implementation.
