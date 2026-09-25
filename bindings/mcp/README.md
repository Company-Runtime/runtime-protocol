# MCP Binding — `mcp/0.1`

| Field    | Value                    |
| -------- | ------------------------ |
| Status   | Normative · Experimental |
| Protocol | `runtime/0.1`            |

The Model Context Protocol is an **interoperability transport**, not a source of the
ontology. Capabilities are defined by the registry; MCP tool names, descriptions and
schemas are generated from it and never the other way around.

This binding has two directions:

1. **Runtime as MCP server** — a runtime exposes the capabilities it can resolve as
   MCP tools, so MCP hosts can submit capability requests.
2. **MCP server as adapter** — an adapter implements a capability by calling tools of
   a downstream MCP server.

## 1. Runtime as MCP server

### 1.1 Transports and lifecycle

The runtime supports the MCP `stdio` and Streamable HTTP transports and the MCP
lifecycle (`initialize`, `notifications/initialized`, `ping`). It declares the `tools`
server capability. Protocol versions are negotiated as MCP defines.

### 1.2 Actor binding

The actor and authority of every request come from the **MCP session**, established
by the host's configuration or transport authentication — never from tool arguments.
A tool call cannot choose or change `actor`, `authority` or `credential`.

### 1.3 Tools

`tools/list` returns one tool per capability the runtime can resolve for the session
actor:

| Tool field     | Value                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`         | The capability identifier with every `.` replaced by `__` (`communication__send`). The mapping is reversible because identifier segments never contain `__`.          |
| `title`        | The capability identifier                                                                                                                                             |
| `description`  | The capability description, followed by its profiles and traits                                                                                                       |
| `inputSchema`  | The tool arguments schema below, with the capability input schema inlined (no external `$ref`)                                                                        |
| `outputSchema` | The tool result schema below                                                                                                                                          |
| `annotations`  | `readOnlyHint: !effects.mutating`, `destructiveHint: verb is delete or risk ≥ high`, `idempotentHint: idempotency trait declared`, `openWorldHint: true` — hints only |
| `_meta`        | `{ "runtime-protocol/capability": "<id>", "runtime-protocol/version": "<version>" }`                                                                                  |

Tool arguments:

| Argument          | Maps to            |
| ----------------- | ------------------ |
| `input`           | `input` (required) |
| `profile`         | `profile`          |
| `traits`          | `traits`           |
| `constraints`     | `constraints`      |
| `evidence`        | `evidence`         |
| `idempotency_key` | `idempotency_key`  |

### 1.4 Calls

`tools/call` builds a `CapabilityRequest` from the arguments, the session actor and a
request identifier chosen by the runtime (or `_meta["runtime-protocol/request_id"]`
when the host supplies one), and processes it exactly as any other request.

The result carries:

- `structuredContent`: `{ "protocol", "execution_id", "status", "output", "receipt",
"error" }` where `status` is the execution state;
- `content`: one text item with a short human-readable summary;
- `isError`: `true` when the state is `rejected`, `failed`, `cancelled` or `unknown`.

`unknown` is an error for the host, but the host MUST NOT retry the call blindly: the
outcome is being reconciled.

## 2. MCP server as adapter

An adapter MAY implement a capability by calling tools of a downstream MCP server:

- The adapter declares **core** capabilities it implements faithfully, and only
  namespaced capabilities (`community.<author>.*`, `vendor.<vendor>.*`) for anything
  else. Downstream tool names never become capability identifiers.
- Evidence comes from observable results — the downstream tool result, a digest of it,
  or a state observation — never from the tool merely returning without error.
- If the downstream call times out after sending, the adapter reports `unknown`.
