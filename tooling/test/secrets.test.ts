import { test } from "node:test";
import assert from "node:assert/strict";
import { findSecrets } from "../src/lib/secrets.ts";

test("detects sensitive keys holding raw values, but not secret references", () => {
  assert.deepEqual(findSecrets({ input: { api_key: "abc" } }), [
    { path: "/input/api_key", kind: "sensitive_key" },
  ]);
  assert.deepEqual(findSecrets({ input: { apiKey: "secret://organization/providers/x" } }), []);
  assert.equal(findSecrets({ Authorization: "whatever" }).length, 1);
  assert.equal(findSecrets({ "Client-Secret": "x" }).length, 1);
});

test("detects well-known secret formats anywhere", () => {
  const fake = {
    a: "-----BEGIN RSA PRIVATE KEY-----",
    b: "Bearer abcdefghijklmnop1234",
    c: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl",
    d: "sk-" + "a".repeat(24),
    e: "AKIA" + "A".repeat(16),
    f: "xoxb-" + "1".repeat(12),
    g: "ghp_" + "b".repeat(36),
    h: "https://user:pass@example.com/",
    i: ["glpat-" + "c".repeat(20)],
  };
  assert.deepEqual(
    findSecrets(fake).map((f) => f.kind),
    [
      "pem_private_key",
      "bearer_credential",
      "json_web_token",
      "prefixed_api_key",
      "access_key_id",
      "chat_platform_token",
      "code_host_token",
      "credentials_in_url",
      "code_host_token",
    ],
  );
});

test("ordinary content is not flagged", () => {
  assert.deepEqual(
    findSecrets({
      content: "Your account has been updated.",
      idempotency_key: "k",
      credential: { owner: "organization" },
      token_count: 5,
    }),
    [],
  );
});
