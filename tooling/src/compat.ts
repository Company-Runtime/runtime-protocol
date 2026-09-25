import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { readDocument, isRecord } from "./lib/documents.ts";
import { Report } from "./lib/findings.ts";
import { ROOT } from "./lib/paths.ts";
import { loadRegistry, schemaPath, type Registry } from "./lib/registry.ts";
import { compareVersions, parseVersion } from "./lib/semver.ts";

type Change = "none" | "compatible" | "breaking";
const EDITORIAL = new Set(["description", "title", "examples", "$comment"]);
const STATUS_ORDER = ["experimental", "candidate", "stable", "deprecated"];

const worst = (a: Change, b: Change): Change =>
  a === "breaking" || b === "breaking"
    ? "breaking"
    : a === "compatible" || b === "compatible"
      ? "compatible"
      : "none";

const typeSet = (schema: Record<string, unknown>): Set<string> | undefined => {
  const t = schema["type"];
  return t === undefined ? undefined : new Set(Array.isArray(t) ? (t as string[]) : [t as string]);
};

/**
 * Classifies a schema change from the caller's point of view (spec/0.1/versioning.md §2).
 * `direction` is "input" (the caller sends it: stricter is breaking) or "output"
 * (the caller receives it: looser is breaking). Unmodelled changes are breaking.
 */
export function classify(before: unknown, after: unknown, direction: "input" | "output"): Change {
  if (isDeepStrictEqual(before, after)) return "none";
  if (!isRecord(before) || !isRecord(after)) return "breaking";
  let change: Change = "none";
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (isDeepStrictEqual(a, b) || EDITORIAL.has(key)) {
      if (!isDeepStrictEqual(a, b)) change = worst(change, "compatible");
      continue;
    }
    switch (key) {
      case "properties": {
        const pa = isRecord(a) ? a : {};
        const pb = isRecord(b) ? b : {};
        for (const name of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
          if (!(name in pb)) change = worst(change, "breaking");
          else if (!(name in pa)) change = worst(change, "compatible");
          else change = worst(change, classify(pa[name], pb[name], direction));
        }
        break;
      }
      case "required": {
        const ra = new Set((a as string[] | undefined) ?? []);
        const rb = new Set((b as string[] | undefined) ?? []);
        const added = [...rb].some((r) => !ra.has(r));
        const removed = [...ra].some((r) => !rb.has(r));
        if (direction === "input" ? added : removed) change = worst(change, "breaking");
        else change = worst(change, "compatible");
        break;
      }
      case "enum": {
        const ea =
          a === undefined ? undefined : new Set((a as unknown[]).map((v) => JSON.stringify(v)));
        const eb =
          b === undefined ? undefined : new Set((b as unknown[]).map((v) => JSON.stringify(v)));
        const narrowed = eb !== undefined && (ea === undefined || [...ea].some((v) => !eb.has(v)));
        const widened = ea !== undefined && (eb === undefined || [...eb].some((v) => !ea.has(v)));
        change = worst(
          change,
          (direction === "input" ? narrowed : widened) ? "breaking" : "compatible",
        );
        break;
      }
      case "type": {
        const ta = typeSet(before) ?? new Set(["*"]);
        const tb = typeSet(after) ?? new Set(["*"]);
        const narrowed = [...ta].some((t) => !tb.has(t) && !tb.has("*"));
        const widened = [...tb].some((t) => !ta.has(t) && !ta.has("*"));
        change = worst(
          change,
          direction === "input"
            ? narrowed
              ? "breaking"
              : "compatible"
            : widened
              ? "breaking"
              : "compatible",
        );
        break;
      }
      case "maxLength":
      case "maximum":
      case "maxItems":
      case "maxProperties": {
        const tighter = b !== undefined && (a === undefined || (b as number) < (a as number));
        change = worst(
          change,
          direction === "input"
            ? tighter
              ? "breaking"
              : "compatible"
            : tighter
              ? "compatible"
              : "breaking",
        );
        break;
      }
      case "minLength":
      case "minimum":
      case "minItems":
      case "minProperties": {
        const tighter = b !== undefined && (a === undefined || (b as number) > (a as number));
        change = worst(
          change,
          direction === "input"
            ? tighter
              ? "breaking"
              : "compatible"
            : tighter
              ? "compatible"
              : "breaking",
        );
        break;
      }
      case "additionalProperties": {
        const closed = b === false && a !== false;
        change = worst(
          change,
          direction === "input"
            ? closed
              ? "breaking"
              : "compatible"
            : closed
              ? "compatible"
              : "breaking",
        );
        break;
      }
      case "items":
        change = worst(change, classify(a, b, direction));
        break;
      default:
        change = worst(change, "breaking");
    }
  }
  return change;
}

function bumpOf(before: string, after: string): "none" | "patch" | "minor" | "major" | "decrease" {
  const a = parseVersion(before);
  const b = parseVersion(after);
  if (!a || !b) return "none";
  const order = compareVersions(b, a);
  if (order < 0) return "decrease";
  if (order === 0) return "none";
  if (b.major !== a.major) return "major";
  if (b.minor !== a.minor) return "minor";
  return "patch";
}

/** Extracts the registry and schemas of a git ref into a temporary directory. */
function checkout(ref: string): string | undefined {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: ROOT,
      stdio: "ignore",
    });
  } catch {
    return undefined;
  }
  const dir = mkdtempSync(join(tmpdir(), "runtime-protocol-base-"));
  const tar = execFileSync("git", ["archive", "--format=tar", ref], {
    cwd: ROOT,
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  return dir;
}

export function compareRegistries(base: Registry, head: Registry): Report {
  const report = new Report();
  for (const [id, { doc: old, file: oldFile }] of base.capabilities) {
    const current = head.capabilities.get(id);
    if (!current) {
      if (old.status !== "deprecated")
        report.error("CC001", oldFile, `${id} was removed without being deprecated first`);
      continue;
    }
    const { doc, file } = current;
    const bump = bumpOf(old.version, doc.version);
    if (bump === "decrease")
      report.error("CC003", file, `${id} version decreased from ${old.version} to ${doc.version}`);
    const oldIndex = STATUS_ORDER.indexOf(old.status);
    const newIndex = STATUS_ORDER.indexOf(doc.status);
    if (newIndex < oldIndex)
      report.error("CC004", file, `${id} status regressed from ${old.status} to ${doc.status}`);

    let change: Change = "none";
    for (const kind of ["input", "output"] as const) {
      const before = readDocument(schemaPath(oldFile, old[kind]) ?? "") as Record<string, unknown>;
      const after = readDocument(schemaPath(file, doc[kind]) ?? "") as Record<string, unknown>;
      const { $id: _a, ...b } = before;
      const { $id: _b, ...c } = after;
      change = worst(change, classify(b, c, kind));
    }
    const semantic = [
      "profiles",
      "traits",
      "effects",
      "evidence",
      "risk",
      "emits",
      "domain",
      "verb",
    ] as const;
    for (const field of semantic) {
      if (!isDeepStrictEqual(old[field], doc[field])) {
        const removedProfile =
          field === "profiles" && old.profiles.some((p) => !doc.profiles.includes(p));
        const removedTrait =
          field === "traits" &&
          [...(old.traits.optional ?? []), ...(old.traits.required ?? [])].some(
            (t) => ![...(doc.traits.optional ?? []), ...(doc.traits.required ?? [])].includes(t),
          );
        const breaking =
          removedProfile ||
          removedTrait ||
          field === "effects" ||
          field === "domain" ||
          field === "verb";
        change = worst(change, breaking ? "breaking" : "compatible");
      }
    }
    if (change === "none") continue;
    const zero = parseVersion(old.version)?.major === 0;
    const enough =
      change === "breaking" ? (zero ? ["minor", "major"] : ["major"]) : ["patch", "minor", "major"];
    if (!enough.includes(bump))
      report.error(
        "CC002",
        file,
        `${id} has a ${change} change but its version went ${old.version} → ${doc.version}; ${change === "breaking" ? (zero ? "a minor" : "a major") : "at least a patch"} bump is required`,
      );
  }
  for (const kind of ["domains", "verbs", "profiles", "traits"] as const) {
    for (const [id, { file }] of base[kind])
      if (!head[kind].has(id))
        report.error("CC005", file, `${kind.slice(0, -1)} '${id}' was removed`);
  }
  return report;
}

/** Compares this checkout with `ref`; without a base registry there is nothing to compare. */
export function compatibilityCheck(ref: string): number {
  const dir = checkout(ref);
  if (!dir || !existsSync(join(dir, "registry", "registry.yaml"))) {
    console.log(`✓ compatibility: no registry at base '${ref}'; nothing to compare`);
    if (dir) rmSync(dir, { recursive: true, force: true });
    return 0;
  }
  try {
    const base = loadRegistry(join(dir, "registry"), join(dir, "recipes"));
    return compareRegistries(base, loadRegistry()).print("compatibility", `against ${ref}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
