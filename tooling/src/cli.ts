import { validateSchemas } from "./validate-schemas.ts";
import { validateExamples } from "./validate-examples.ts";
import { validateRegistry } from "./validate-registry.ts";
import { syncGraph } from "./graph.ts";
import { validateBindings } from "./validate-bindings.ts";
import { semanticLint, loadExtensions } from "./semantic-lint.ts";
import { compatibilityCheck } from "./compat.ts";
import { docsCheck } from "./docs-check.ts";
import { validateConformance } from "./validate-conformance.ts";

type Command = () => number;

const commands: Record<string, Command> = {
  registry: () => {
    const { report, summary } = validateRegistry();
    return report.print("registry", summary);
  },
  graph: () => syncGraph(process.argv.includes("--check")),
  lint: () => {
    const extensions = loadExtensions();
    return semanticLint().print(
      "semantic lint",
      `core registry and ${extensions.length} extension capability(ies)`,
    );
  },
  compat: () => {
    const at = process.argv.indexOf("--base");
    const base = at > 0 ? process.argv[at + 1] : process.env["COMPAT_BASE"];
    return compatibilityCheck(base ?? "origin/main");
  },
  conformance: () => {
    const { report, summary } = validateConformance();
    return report.print("conformance", summary);
  },
  docs: () => {
    const { report, count } = docsCheck();
    return report.print("docs", `${count} Markdown file(s)`);
  },
  bindings: () => {
    const { report, count } = validateBindings();
    return report.print("bindings", `${count} binding document(s)`);
  },
  schemas: () => validateSchemas().print("schemas", "schemas/0.1"),
  examples: () => {
    const { report, count } = validateExamples();
    return report.print("examples", `${count} example(s)`);
  },
};

const name = process.argv[2] ?? "";
const command = commands[name];
if (!command) {
  console.error(`usage: node tooling/src/cli.ts <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}
process.exit(command());
