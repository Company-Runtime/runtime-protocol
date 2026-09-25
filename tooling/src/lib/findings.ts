import { rel } from "./paths.ts";

export type Severity = "error" | "warning";

export interface Finding {
  rule: string;
  severity: Severity;
  file: string;
  message: string;
}

/** Collects findings and prints them deterministically (sorted by file, rule, message). */
export class Report {
  readonly findings: Finding[] = [];

  error(rule: string, file: string, message: string): void {
    this.findings.push({ rule, severity: "error", file: rel(file), message });
  }

  warning(rule: string, file: string, message: string): void {
    this.findings.push({ rule, severity: "warning", file: rel(file), message });
  }

  get errors(): Finding[] {
    return this.findings.filter((f) => f.severity === "error");
  }

  get warnings(): Finding[] {
    return this.findings.filter((f) => f.severity === "warning");
  }

  sorted(): Finding[] {
    return [...this.findings].sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.rule.localeCompare(b.rule) ||
        a.message.localeCompare(b.message),
    );
  }

  /** Prints findings and returns the process exit code. */
  print(title: string, checked: string): number {
    for (const f of this.sorted()) {
      console.log(`${f.severity === "error" ? "✗" : "!"} ${f.file} [${f.rule}] ${f.message}`);
    }
    const summary = `${title}: ${checked}; ${this.errors.length} error(s), ${this.warnings.length} warning(s)`;
    console.log(this.errors.length === 0 ? `✓ ${summary}` : `✗ ${summary}`);
    return this.errors.length === 0 ? 0 : 1;
  }
}
