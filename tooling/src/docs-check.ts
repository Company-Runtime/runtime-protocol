import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { listFiles, readDocument, isRecord } from "./lib/documents.ts";
import { Report } from "./lib/findings.ts";
import { fromRoot, ROOT } from "./lib/paths.ts";
import { loadRegistry } from "./lib/registry.ts";
import { LINT_RULES } from "./semantic-lint.ts";

export const REQUIRED_SPEC = [
  "protocol.md",
  "semantics.md",
  "capabilities.md",
  "requests.md",
  "providers.md",
  "authority.md",
  "policy.md",
  "evidence.md",
  "execution.md",
  "discovery.md",
  "extensions.md",
  "versioning.md",
  "errors.md",
  "security.md",
  "conformance.md",
];

/** GitHub-style heading anchor. */
export function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchors(markdown: string): Set<string> {
  const out = new Set<string>();
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const m = !fenced && /^#{1,6}\s+(.*)$/.exec(line);
    if (m && m[1]) out.add(slug(m[1].replace(/`/g, "")));
  }
  return out;
}

/** Backticked identifiers in the first column of Markdown table rows under a heading. */
function tableColumn(markdown: string, headingPrefix: string): Set<string> {
  const lines = markdown.split("\n");
  const start = lines.findIndex(
    (l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s+/, "").startsWith(headingPrefix),
  );
  const out = new Set<string>();
  if (start < 0) return out;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^#{1,6}\s/.test(line)) break;
    const m = /^\|\s*`([^`]+)`/.exec(line);
    if (m && m[1]) out.add(m[1]);
  }
  return out;
}

function textBlockAfter(markdown: string, marker: string): Set<string> {
  const at = markdown.indexOf(marker);
  if (at < 0) return new Set();
  const block = /```text\n([\s\S]*?)```/.exec(markdown.slice(at));
  return new Set((block?.[1] ?? "").split(/\s+/).filter(Boolean));
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));
const describe = (a: Set<string>, b: Set<string>) =>
  `missing [${[...b].filter((x) => !a.has(x)).join(", ")}], unexpected [${[...a].filter((x) => !b.has(x)).join(", ")}]`;

export function docsCheck(): { report: Report; count: number } {
  const report = new Report();
  const files = listFiles(ROOT, [".md"]);
  const anchorCache = new Map<string, Set<string>>();
  const anchorsOf = (file: string) => {
    if (!anchorCache.has(file)) anchorCache.set(file, anchors(readFileSync(file, "utf8")));
    return anchorCache.get(file)!;
  };

  // Links resolve, including anchors into Markdown files.
  for (const file of files) {
    const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1]!;
      if (/^[a-z]+:/i.test(target)) continue;
      const [path, anchor] = target.split("#");
      const resolved = path ? join(dirname(file), path) : file;
      if (!existsSync(resolved)) {
        report.error("DOC_LINK", file, `broken link ${target}`);
        continue;
      }
      if (anchor && resolved.endsWith(".md") && !anchorsOf(resolved).has(anchor))
        report.error("DOC_ANCHOR", file, `missing anchor ${target}`);
    }
  }

  for (const name of REQUIRED_SPEC)
    if (!existsSync(fromRoot("spec", "0.1", name)))
      report.error("DOC_SPEC", fromRoot("spec", "0.1"), `${name} is missing`);

  // Normative tables match the schemas and the registry.
  const common = readDocument(fromRoot("schemas", "0.1", "common.schema.json")) as {
    $defs: Record<string, any>;
  };
  const enumOf = (name: string): Set<string> => {
    const def = common.$defs[name];
    const values =
      def.enum ??
      def.anyOf?.find((x: Record<string, unknown>) => Array.isArray(x["enum"]))?.enum ??
      [];
    return new Set(values as string[]);
  };
  const read = (...p: string[]) => readFileSync(fromRoot(...p), "utf8");
  const checks: Array<[string, Set<string>, Set<string>, string]> = [
    [
      "spec/0.1/errors.md",
      tableColumn(read("spec", "0.1", "errors.md"), "2. Codes"),
      enumOf("errorCode"),
      "error codes",
    ],
    [
      "spec/0.1/execution.md",
      tableColumn(read("spec", "0.1", "execution.md"), "1. State machine"),
      enumOf("executionState"),
      "execution states",
    ],
    [
      "spec/0.1/evidence.md",
      tableColumn(read("spec", "0.1", "evidence.md"), "3. Evidence types"),
      enumOf("evidenceType"),
      "evidence types",
    ],
    [
      "spec/0.1/evidence.md",
      tableColumn(read("spec", "0.1", "evidence.md"), "4. Claims"),
      enumOf("evidenceClaim"),
      "evidence claims",
    ],
    [
      "spec/0.1/semantics.md",
      tableColumn(read("spec", "0.1", "semantics.md"), "Lint rule index"),
      new Set(LINT_RULES),
      "lint rules",
    ],
  ];
  const registry = loadRegistry();
  const capabilities = read("spec", "0.1", "capabilities.md");
  checks.push([
    "spec/0.1/capabilities.md",
    textBlockAfter(capabilities, "Core domains in v0.1"),
    new Set(registry.domains.keys()),
    "core domains",
  ]);
  checks.push([
    "spec/0.1/capabilities.md",
    textBlockAfter(capabilities, "Canonical verbs in v0.1"),
    new Set(registry.verbs.keys()),
    "canonical verbs",
  ]);
  const httpCodes = new Set(
    [...read("bindings", "http", "README.md").matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!),
  );
  for (const code of enumOf("errorCode"))
    if (!httpCodes.has(code))
      report.error(
        "DOC_TABLE",
        fromRoot("bindings", "http", "README.md"),
        `status table misses ${code}`,
      );
  for (const [file, documented, defined, label] of checks)
    if (!sameSet(documented, defined))
      report.error(
        "DOC_TABLE",
        fromRoot(file),
        `${label} differ from the definitions: ${describe(documented, defined)}`,
      );
  for (const id of [...registry.profiles.keys(), ...registry.traits.keys()])
    if (!capabilities.includes(`\`${id}\``))
      report.error("DOC_TABLE", fromRoot("spec/0.1/capabilities.md"), `does not list ${id}`);

  const changelog = read("CHANGELOG.md");
  if (!/^## Unreleased/m.test(changelog) && !/^## \[?\d/m.test(changelog))
    report.error("DOC_CHANGELOG", fromRoot("CHANGELOG.md"), "has no release section");
  void isRecord;
  void relative;
  return { report, count: files.length };
}
