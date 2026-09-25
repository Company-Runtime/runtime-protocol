## Summary

<!-- What changes and why. Link the RFC or issue. -->

## Kind of change

- [ ] Editorial (no normative change)
- [ ] Capability, profile or trait (answer the ten questions below)
- [ ] Schema or binding
- [ ] Conformance fixtures or tests
- [ ] Tooling

## The ten questions (vocabulary changes only)

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

## Merge gate

- [ ] The protocol does not import or reference any runtime product.
- [ ] No core capability contains a vendor.
- [ ] No secret appears in fixtures, examples or logs.
- [ ] Requests validate by schema.
- [ ] Authority is deny-by-default.
- [ ] Resolution is deterministic.
- [ ] Evidence is separate from assertion.
- [ ] Receipts are vendor-neutral.
- [ ] MCP is a binding, not core.
- [ ] Recipes did not become primitives.
- [ ] Extensions do not contaminate core.
- [ ] Similarity findings (SL008, SL010) were reviewed and recorded.
- [ ] Docs reflect exactly what is defined; CHANGELOG updated.
