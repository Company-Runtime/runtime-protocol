# Versioning

| Field    | Value                                                         |
| -------- | ------------------------------------------------------------- |
| Status   | Normative · Experimental                                      |
| Protocol | `runtime/0.1`                                                 |
| Scope    | Protocol, capability, provider, binding and registry versions |

Four things are versioned **independently**:

| Versioned thing | Format                      | Example       | Where                         |
| --------------- | --------------------------- | ------------- | ----------------------------- |
| Protocol        | `runtime/<major>.<minor>`   | `runtime/0.1` | `protocol` field of documents |
| Capability      | Semantic Versioning 2.0     | `0.1.0`       | Registry definition           |
| Provider        | Semantic Versioning 2.0     | `1.4.2`       | Provider manifest             |
| Binding         | `<binding>/<major>.<minor>` | `http/0.1`    | Binding specification         |

## 1. Protocol

- Documents carry the exact protocol version. A receiver MUST reject versions it does
  not support with `unsupported_version`.
- While the major version is `0`, a minor version MAY contain breaking changes; each
  one is listed in [CHANGELOG.md](../../CHANGELOG.md) with a migration note.
- From `runtime/1.0`, breaking changes require a new major version.

## 2. Capabilities

- A change to a capability's meaning, or a breaking change to its input or output
  schema, requires a new **major** version — or a new **minor** version while the major
  version is `0`.
- Breaking input changes include: adding a required field, removing or renaming a
  field, narrowing a type, enumeration or bound, and disallowing previously allowed
  additional properties.
- Breaking output changes include: removing or renaming a field, making a field
  optional, widening a type or enumeration that callers must handle.
- Adding optional input fields, profiles or optional traits is a minor change (a patch
  change while the major version is `0`).
- Editorial changes to descriptions that do not change meaning are patch changes.
- The compatibility check (`tooling/compat`) enforces these rules against the base
  branch.

## 3. Version ranges

Requests and manifests select capability versions with ranges:

| Form     | Meaning                                       | Example                                                  |
| -------- | --------------------------------------------- | -------------------------------------------------------- |
| `X.Y.Z`  | Exactly that version                          | `0.1.0`                                                  |
| `^X.Y.Z` | `>=X.Y.Z` and below the next breaking version | `^0.1.0` = `>=0.1.0 <0.2.0`; `^1.2.0` = `>=1.2.0 <2.0.0` |
| `^X.Y`   | Same as `^X.Y.0`                              | `^0.1`                                                   |
| `~X.Y.Z` | `>=X.Y.Z` and `<X.(Y+1).0`                    | `~0.1.2`                                                 |
| `X.Y`    | `>=X.Y.0` and `<X.(Y+1).0`                    | `0.1`                                                    |
| `X`      | `>=X.0.0` and `<(X+1).0.0`                    | `1`                                                      |
| `*`      | Any version                                   | `*`                                                      |

The "next breaking version" of `X.Y.Z` is `(X+1).0.0` when `X > 0`, `0.(Y+1).0` when
`X = 0` and `Y > 0`, and `0.0.(Z+1)` when `X = Y = 0`. Pre-release versions satisfy a
range only when the range names the same `X.Y.Z` with a pre-release tag. No other
range syntax is defined.

## 4. Providers and bindings

- Provider versions describe implementations and never change capability semantics.
- Binding versions describe the mapping to a transport. A binding change never changes
  capability semantics.

## 5. Registry

The registry as a whole has the version of the protocol it belongs to (`0.1`), and
each definition carries its own version. A runtime SHOULD expose the registry version
and digest it uses in its discovery document ([discovery.md](discovery.md)).
