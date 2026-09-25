import { validateSchemas } from "./validate-schemas.ts";
import { validateExamples } from "./validate-examples.ts";

type Command = () => number;

const commands: Record<string, Command> = {
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
