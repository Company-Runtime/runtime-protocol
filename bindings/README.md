# Bindings

Bindings carry the Runtime Protocol over a transport. **They never change semantics**:
a capability, request, receipt, error or event means the same thing over every
binding.

| Binding                    | Version      | Carries                                                        |
| -------------------------- | ------------ | -------------------------------------------------------------- |
| [HTTP](http/README.md)     | `http/0.1`   | Caller → runtime API, runtime → remote provider API, discovery |
| [MCP](mcp/README.md)       | `mcp/0.1`    | Capabilities exposed as MCP tools; MCP servers as adapters     |
| [Events](events/README.md) | `events/0.1` | Protocol events as CloudEvents 1.0                             |

Rules shared by every binding:

1. A binding MUST NOT add, remove or rename capabilities, profiles, traits, states or
   error codes.
2. A binding MUST NOT transport secret material. Credentials cross bindings only as
   `CredentialRef`s.
3. A binding MUST establish, before authority is evaluated, that the caller is
   entitled to act as `actor.ref` (see [security](../spec/0.1/security.md)).
4. Binding versions are independent of the protocol and capability versions
   ([versioning](../spec/0.1/versioning.md)).
