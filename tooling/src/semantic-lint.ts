import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { listFiles, readDocument, isRecord } from "./lib/documents.ts";
import { Report } from "./lib/findings.ts";
import { fromRoot } from "./lib/paths.ts";
import {
  loadRegistry,
  schemaPath,
  type Capability,
  type Entry,
  type Registry,
} from "./lib/registry.ts";
import { parseCapabilityId, shadowsCore } from "./lib/naming.ts";
import { containsSequence, contentTokens, jaccard, readTermList, tokens } from "./lib/text.ts";

/** Every rule of the semantic constitution's lint index (spec/0.1/semantics.md). */
export const LINT_RULES = [
  "SL001",
  "SL002",
  "SL003",
  "SL004",
  "SL005",
  "SL006",
  "SL007",
  "SL008",
  "SL009",
  "SL010",
  "SL011",
  "SL012",
  "SL013",
  "SL014",
  "SL015",
  "SL016",
  "SL017",
  "SL018",
  "SL019",
  "SL020",
] as const;

export const EXTENSIONS_DIR = fromRoot("extensions");
const SIMILARITY_THRESHOLD = 0.5;
const VOCABULARY_BUDGET = 50;
const TEN_QUESTIONS = [
  "Which new intent does it represent?",
  "Why does no existing capability serve?",
  "Why does a profile not serve?",
  "Why does a trait not serve?",
  "Why does a Recipe not serve?",
  "Is there vendor leakage?",
  "Are there at least two plausible independent executors?",
  "What observable difference exists for the caller?",
  "Which evidence proves completion?",
  "Which existing primitives are closest?",
];

export interface LintInput {
  registry: Registry;
  /** Extension capability definitions found under extensions/. */
  extensions: Array<Entry<Capability>>;
}

export function loadExtensions(root: string = EXTENSIONS_DIR): Array<Entry<Capability>> {
  return listFiles(root, [".yaml", ".yml"])
    .filter((f) => basename(f) === "capability.yaml")
    .map((file) => ({ file, doc: readDocument(file) as Capability }));
}

/** The namespace an extension file must use, from its directory. */
function expectedPrefix(file: string): string | undefined {
  const parts = relative(EXTENSIONS_DIR, file).split(/[\\/]/);
  if (parts[0] === "experimental") return "experimental.";
  if ((parts[0] === "community" || parts[0] === "vendor") && parts[1])
    return `${parts[0]}.${parts[1]}.`;
  return undefined;
}

function schemaKeys(schema: unknown, out: string[] = []): string[] {
  if (Array.isArray(schema)) for (const item of schema) schemaKeys(item, out);
  else if (isRecord(schema)) {
    if (isRecord(schema["properties"])) out.push(...Object.keys(schema["properties"]));
    for (const [key, value] of Object.entries(schema))
      if (key !== "enum" && key !== "const") schemaKeys(value, out);
  }
  return out;
}

function proposalAnswered(path: string): boolean {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  return TEN_QUESTIONS.every((question) => {
    const at = text.indexOf(question);
    if (at < 0) return false;
    const after =
      text
        .slice(at + question.length)
        .split(/\n\s*\n/)
        .find((block) => block.trim().length > 0) ?? "";
    return after.trim().length >= 10 && !after.trim().startsWith("#");
  });
}

function rfcExists(rfc: string): boolean {
  return readdirSync(fromRoot("rfcs")).some((name) => name.startsWith(`${rfc}-`));
}

interface Acknowledgment {
  rule: string;
  subjects: string[];
  record: string;
  rationale: string;
}

/** Removes warnings that a recorded human decision accepted (tooling/data/lint-acknowledgments.yaml). */
function applyAcknowledgments(report: Report): void {
  const file = fromRoot("tooling", "data", "lint-acknowledgments.yaml");
  const acks = (existsSync(file) ? (readDocument(file) as Acknowledgment[] | null) : null) ?? [];
  for (const ack of acks) {
    if (!["SL008", "SL010"].includes(ack.rule))
      report.error("SL000", file, `${ack.rule} findings cannot be acknowledged`);
    if (!existsSync(fromRoot(ack.record)))
      report.error("SL000", file, `record ${ack.record} does not exist`);
  }
  const acknowledged = (rule: string, message: string) =>
    acks.some(
      (ack) => ack.rule === rule && ack.subjects.every((subject) => message.includes(subject)),
    );
  for (let i = report.findings.length - 1; i >= 0; i--) {
    const finding = report.findings[i]!;
    if (finding.severity === "warning" && acknowledged(finding.rule, finding.message))
      report.findings.splice(i, 1);
  }
}

export function semanticLint(
  input: LintInput = { registry: loadRegistry(), extensions: loadExtensions() },
): Report {
  const report = new Report();
  const { registry } = input;
  const vendors = readTermList("vendor-terms.txt");
  const transports = readTermList("transport-terms.txt");
  const synonymOf = new Map<string, string>();

  // SL018 — rejected synonyms are unique, never canonical verbs or domains.
  for (const { file, doc } of registry.verbs.values()) {
    for (const synonym of doc.rejected_synonyms) {
      if (registry.verbs.has(synonym))
        report.error("SL018", file, `rejected synonym '${synonym}' is a canonical verb`);
      if (registry.domains.has(synonym))
        report.error("SL018", file, `rejected synonym '${synonym}' is a domain`);
      const owner = synonymOf.get(synonym);
      if (owner && owner !== doc.id)
        report.error("SL018", file, `'${synonym}' is also a rejected synonym of '${owner}'`);
      synonymOf.set(synonym, doc.id);
    }
  }

  const coreIds = new Set(
    [...registry.capabilities.keys()].filter((id) => {
      const parsed = parseCapabilityId(id);
      return !("error" in parsed) && parsed.namespace === "core";
    }),
  );
  const profileTokens = [...registry.profiles.keys()].map((id) => tokens(id));
  const traitTokens = [...registry.traits.keys()].map((id) => tokens(id));
  const all: Array<Entry<Capability> & { core: boolean }> = [
    ...[...registry.capabilities.values()].map((e) => ({ ...e, core: true })),
    ...input.extensions.map((e) => ({ ...e, core: false })),
  ];

  const leakage = (
    terms: Set<string>,
    rule: "SL009" | "SL019",
    label: string,
    file: string,
    text: string,
  ) => {
    for (const token of tokens(text))
      if (terms.has(token)) report.error(rule, file, `${label} contains '${token}'`);
  };

  for (const { file, doc, core } of all) {
    const id = doc.id;
    // SL001 — grammar.
    const parsed = parseCapabilityId(id);
    if ("error" in parsed) {
      report.error("SL001", file, `${id}: ${parsed.error}`);
      continue;
    }
    // SL012 — namespace isolation.
    if (core && parsed.namespace !== "core")
      report.error("SL012", file, `${id} is namespaced but lives in the core registry`);
    if (!core) {
      const prefix = expectedPrefix(file);
      if (!prefix || !id.startsWith(prefix))
        report.error("SL012", file, `${id} does not belong to this extension directory`);
      if (shadowsCore(parsed, coreIds))
        report.error("SL012", file, `${id} shadows core capability ${parsed.local.join(".")}`);
    }
    const [domain] = parsed.local;
    const verb = parsed.local[parsed.local.length - 1]!;
    // SL002 / SL003 / SL004 — domain, verb, synonyms.
    if (domain && !registry.domains.has(domain) && core)
      report.error("SL002", file, `unknown domain '${domain}'`);
    const synonym = synonymOf.get(verb);
    if (synonym)
      report.error(
        "SL004",
        file,
        `'${verb}' is a rejected synonym of '${synonym}'; use ${id.replace(new RegExp(`${verb}$`), synonym)}`,
      );
    else if (!registry.verbs.has(verb))
      report.error("SL003", file, `'${verb}' is not a canonical verb`);
    // SL005 — object segment needs a justification.
    if (parsed.local.length === 3 && !doc.object_justification)
      report.error(
        "SL005",
        file,
        `${id} uses <domain>.<object>.<verb> without object_justification`,
      );
    // SL006 / SL007 — specialization and variants in the identifier.
    const idTokens = parsed.local.flatMap((segment) => tokens(segment));
    for (const profile of profileTokens)
      if (containsSequence(idTokens, profile))
        report.error("SL006", file, `${id} embeds profile '${profile.join("_")}'; use the profile`);
    for (const trait of traitTokens)
      if (containsSequence(idTokens, trait))
        report.error("SL007", file, `${id} embeds trait '${trait.join("_")}'; use the trait`);
    // SL009 / SL019 — vendor and transport leakage in core vocabulary.
    if (core || parsed.namespace === "experimental") {
      leakage(vendors, "SL009", "identifier", file, id);
      leakage(vendors, "SL009", "description", file, doc.description);
      leakage(transports, "SL019", "identifier", file, id);
      leakage(transports, "SL019", "description", file, doc.description);
      for (const kind of ["input", "output"] as const) {
        const path = schemaPath(file, doc[kind] ?? {});
        const schema = path ? readDocument(path) : doc[kind]?.schema;
        for (const key of schemaKeys(schema)) {
          leakage(vendors, "SL009", `${kind} property '${key}'`, file, key);
          leakage(transports, "SL019", `${kind} property '${key}'`, file, key);
        }
      }
    }
    // SL014 / SL015 — evidence and effects.
    if (
      doc.effects?.mutating &&
      !(doc.evidence?.supported && doc.evidence.claims.includes("execution"))
    )
      report.error("SL014", file, `${id} is mutating and must support the execution claim`);
    const verbDef = registry.verbs.get(verb)?.doc;
    if (verbDef && verbDef.mutating !== "varies" && verbDef.mutating !== doc.effects?.mutating)
      report.error(
        "SL015",
        file,
        `effects.mutating=${String(doc.effects?.mutating)} contradicts verb '${verb}'`,
      );
    // SL016 — emitted events.
    const past = verbDef?.past_tense;
    if (doc.effects?.mutating && domain !== "event" && past) {
      const expected = parsed.namespace === "core" ? `${domain}.${past}` : undefined;
      if (expected && (doc.emits.length !== 1 || doc.emits[0] !== expected))
        report.error("SL016", file, `${id} must emit exactly [${expected}]`);
    } else if (!doc.effects?.mutating && doc.emits.length > 0) {
      report.error("SL016", file, `${id} is not mutating and must not emit events`);
    }
    // SL013 / SL017 — proposals and lifecycle.
    const proposal = doc.proposal_ref ? join(dirname(file), doc.proposal_ref) : undefined;
    const introducedByRfc = doc.rfc !== undefined && rfcExists(doc.rfc);
    if (!introducedByRfc && !(proposal && proposalAnswered(proposal)))
      report.error("SL013", file, `${id} needs an RFC or a proposal answering the ten questions`);
    if (doc.status !== "experimental" && (doc.rfc === undefined || doc.rfc === "0001"))
      report.error("SL017", file, `${id} is '${doc.status}' without a promotion RFC`);
  }

  // SL008 — overlaps (human review).
  const capabilities = all.filter((c) => !("error" in parseCapabilityId(c.doc.id)));
  for (let i = 0; i < capabilities.length; i++) {
    for (let j = i + 1; j < capabilities.length; j++) {
      const a = capabilities[i]!;
      const b = capabilities[j]!;
      const pa = parseCapabilityId(a.doc.id) as { local: string[] };
      const pb = parseCapabilityId(b.doc.id) as { local: string[] };
      const sameIntent =
        pa.local[0] === pb.local[0] &&
        pa.local[pa.local.length - 1] === pb.local[pb.local.length - 1];
      if (sameIntent)
        report.warning("SL008", b.file, `${b.doc.id} has the same domain and verb as ${a.doc.id}`);
      const similarity = jaccard(
        contentTokens(a.doc.description),
        contentTokens(b.doc.description),
      );
      if (similarity >= SIMILARITY_THRESHOLD)
        report.warning(
          "SL008",
          b.file,
          `${b.doc.id} description is similar to ${a.doc.id} (${similarity.toFixed(2)})`,
        );
    }
  }

  // SL010 — descriptions naming several actions suggest a Recipe (human review).
  const verbWords = new Set(registry.verbs.keys());
  for (const { file, doc } of all) {
    const firstSentence = doc.description.split(/[.;:]/)[0] ?? "";
    const actions = new Set(tokens(firstSentence).filter((t) => verbWords.has(t)));
    if (actions.size >= 2 && /\b(and|then)\b/.test(firstSentence))
      report.warning(
        "SL010",
        file,
        `${doc.id} describes several actions (${[...actions].join(", ")}); consider a Recipe`,
      );
  }

  // SL011 — recipes are never capabilities.
  for (const { file, doc } of registry.recipes.values()) {
    if (registry.capabilities.has(doc.id) || input.extensions.some((e) => e.doc.id === doc.id))
      report.error("SL011", file, `recipe ${doc.id} collides with a capability`);
  }
  for (const { file, doc } of all) {
    if (isRecord(doc) && "steps" in (doc as object))
      report.error("SL011", file, `${doc.id} is a recipe registered as a capability`);
  }

  applyAcknowledgments(report);

  // SL020 — vocabulary budget.
  if (coreIds.size > VOCABULARY_BUDGET)
    report.warning(
      "SL020",
      fromRoot("registry"),
      `${coreIds.size} core capabilities exceed the budget of ${VOCABULARY_BUDGET}`,
    );
  return report;
}
