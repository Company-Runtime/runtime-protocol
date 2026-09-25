# Tooling

Deterministic validators for this repository. They use Node.js ≥ 22.18 (native
TypeScript type stripping) and no network access.

| Command                      | Checks                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `pnpm run validate:schemas`  | Every schema is Draft 2020-12, has a URN `$id` matching its file, and compiles |
| `pnpm run validate:examples` | Every file in `examples/<schema>/` validates against `<schema>`; digests match |
| `pnpm test`                  | Unit tests of the tooling itself                                               |
| `pnpm run ci`                | The full pipeline, as run in CI                                                |

Language models are never called by this tooling. Every result is reproducible from
the repository content alone.
