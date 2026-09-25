# Recipes

A **recipe** is a composition of capability requests — level L2 in the vocabulary
levels of [spec/0.1/capabilities.md](../spec/0.1/capabilities.md). Recipes are how the
protocol grows without growing its vocabulary: before proposing a capability, try a
recipe.

| Level | Name                   | Canonical vocabulary |
| ----- | ---------------------- | -------------------- |
| L0    | Primitive (capability) | Yes                  |
| L1    | Profile                | Yes                  |
| L2    | Recipe                 | No                   |
| L3    | Organizational process | No                   |

Rules:

- Every step names a registered capability; each step is an independent capability
  request with its own authority, policy, resolution, evidence and receipt.
- Step inputs are literal values or `{ $from: <path> }` bindings, where `<path>` is
  `inputs.<field>…` or `steps.<earlier-step-id>.output.<field>…`.
- A recipe identifier never equals a capability identifier, and recipes are never
  registered as capabilities.

The recipes in [`examples/`](examples/) validate against `schemas/0.1/recipe.schema.json`
and are checked by `pnpm run validate:registry`.
