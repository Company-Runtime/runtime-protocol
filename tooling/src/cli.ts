import { validateSchemas } from "./validate-schemas.ts";
import { validateExamples } from "./validate-examples.ts";
import { validateRegistry } from "./validate-registry.ts";
import { syncGraph } from "./graph.ts";

type Command = () => number;

const commands: Record<string, Command> = {
  registry: () => {
    const { report, summary } = validateRegistry();
    return report.print("registry", summary);
  },
  graph: () => syncGraph(process.argv.includes("--check")),
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
