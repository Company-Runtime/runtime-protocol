/** Deterministic raw-secret detection (spec/0.1/security.md §2). Values are never echoed. */
export const SENSITIVE_KEYS = new Set([
  "apikey",
  "accesstoken",
  "refreshtoken",
  "authtoken",
  "bearertoken",
  "token",
  "secret",
  "clientsecret",
  "password",
  "passwd",
  "privatekey",
  "authorization",
  "sessiontoken",
  "credentials",
]);

export const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["pem_private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["bearer_credential", /^Bearer [A-Za-z0-9._~+/=-]{16,}$/],
  ["json_web_token", /^eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/],
  ["prefixed_api_key", /^(sk|pk|rk)-[A-Za-z0-9_-]{16,}$/],
  ["access_key_id", /^(AKIA|ASIA)[A-Z0-9]{16}$/],
  ["chat_platform_token", /^xox[abpors]-[A-Za-z0-9-]{10,}$/],
  ["code_host_token", /^(ghp|gho|ghu|ghs|ghr|glpat)[-_][A-Za-z0-9_]{16,}$/],
  ["credentials_in_url", /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/],
];

export interface SecretFinding {
  /** JSON Pointer to the offending value. */
  path: string;
  kind: string;
}

const normalizeKey = (key: string) => key.toLowerCase().replace(/[-_]/g, "");
const pointer = (path: string, key: string | number) =>
  `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;

export function findSecrets(value: unknown, path = ""): SecretFinding[] {
  const out: SecretFinding[] = [];
  const visit = (node: unknown, at: string, key?: string): void => {
    if (typeof node === "string") {
      if (
        key !== undefined &&
        SENSITIVE_KEYS.has(normalizeKey(key)) &&
        !node.startsWith("secret://")
      ) {
        out.push({ path: at, kind: "sensitive_key" });
        return;
      }
      for (const [kind, pattern] of SECRET_PATTERNS) {
        if (pattern.test(node)) {
          out.push({ path: at, kind });
          return;
        }
      }
    } else if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, pointer(at, i)));
    } else if (typeof node === "object" && node !== null) {
      for (const [k, item] of Object.entries(node)) visit(item, pointer(at, k), k);
    }
  };
  visit(value, path);
  return out;
}
