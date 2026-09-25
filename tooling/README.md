# Tooling

Deterministic validators for this repository. They use Node.js ≥ 22.18 (native
TypeScript type stripping) and no network access.

| Command                      | Checks                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm run validate:schemas`  | Every schema is Draft 2020-12, has a URN `$id` matching its file, and compiles                                          |
| `pnpm run validate:registry` | Registry definitions: schemas, file names, references, trait gates, claims, aliases, recipes, graph                     |
| `pnpm run validate:examples` | Examples validate against their schema; requests and manifests validate against the registry; digests match; no secrets |
| `pnpm run registry:graph`    | Regenerates `registry/graph.json`                                                                                       |
| `pnpm test`                  | Unit tests of the tooling itself                                                                                        |
| `pnpm run ci`                | The full pipeline, as run in CI                                                                                         |

## Library

`tooling/src/lib/` holds the reference document checks used by the commands:

| Module         | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| `canonical.ts` | RFC 8785 canonical JSON and `sha256:` digests                       |
| `semver.ts`    | Semantic versions and the range grammar of `spec/0.1/versioning.md` |
| `secrets.ts`   | Raw-secret detection of `spec/0.1/security.md` §2                   |
| `naming.ts`    | Capability identifier grammar and namespace isolation               |
| `request.ts`   | Request validation steps 1–11 of `spec/0.1/requests.md` §5          |
| `manifest.ts`  | Provider manifest checks against the registry                       |
| `overlay.ts`   | Registry overlays: namespaced additions and deprecated aliases      |
| `registry.ts`  | Registry loading                                                    |

These are document validators for this repository, not a runtime. Runtime
implementations live in SDKs.

Language models are never called by this tooling. Every result is reproducible from
the repository content alone.
