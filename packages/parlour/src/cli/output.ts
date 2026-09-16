import type { Check } from "../core/ports.ts";

/**
 * How the CLI talks. Two audiences: a person at a terminal, and the desktop
 * app reading a pipe. The app gets one JSON document per `--json` command and
 * one JSON line per event under `--porcelain`, and never has to parse prose.
 */

const bold = (text: string) => (process.stdout.isTTY ? `\x1b[1m${text}\x1b[0m` : text);
const yellow = (text: string) => (process.stdout.isTTY ? `\x1b[33m${text}\x1b[0m` : text);
const red = (text: string) => (process.stderr.isTTY ? `\x1b[31m${text}\x1b[0m` : text);

/** One document, one line, and nothing else on stdout around it. */
export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

/** Left-aligned columns, the way `service status` and `doctor` print. */
export function table(rows: string[][]): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) =>
      row
        .map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export type EventKind = "step" | "ok" | "warn" | "fail" | "log" | "done";

/**
 * The installer's voice. `step` opens a section, `ok`/`warn`/`fail` report
 * within it, `log` relays a line from a command that is running, and `done`
 * closes the run with whether anything failed.
 */
export interface Reporter {
  step(text: string): void;
  ok(text: string): void;
  warn(text: string): void;
  fail(text: string): void;
  log(text: string): void;
  done(failed: boolean): void;
  readonly porcelain: boolean;
}

/** `{"kind":"step","text":"Tools"}`, one per line, for the desktop app. */
export function porcelainReporter(): Reporter {
  const line = (kind: EventKind, text: string) => process.stdout.write(`${JSON.stringify({ kind, text })}\n`);
  return {
    porcelain: true,
    step: (text) => line("step", text),
    ok: (text) => line("ok", text),
    warn: (text) => line("warn", text),
    fail: (text) => line("fail", text),
    log: (text) => line("log", text),
    done: (failed) => line("done", failed ? "1" : "0"),
  };
}

/** Headings, indented lines, and colour only when there is a terminal to show it. */
export function humanReporter(): Reporter {
  return {
    porcelain: false,
    step: (text) => process.stdout.write(`\n${bold(`==> ${text}`)}\n`),
    ok: (text) => process.stdout.write(`    ${text}\n`),
    warn: (text) => process.stdout.write(`${yellow(`    ${text}`)}\n`),
    fail: (text) => process.stderr.write(`${red(`    ${text}`)}\n`),
    log: (text) => process.stdout.write(`    ${text}\n`),
    done: () => {},
  };
}

/** `ok    name   detail`, one per check, as the old doctor printed. */
export function formatChecks(checks: Check[]): string {
  const mark = { ok: "ok  ", warn: "warn", fail: "FAIL" };
  return table(checks.map((check) => [mark[check.status], check.name, check.detail]));
}

/** The old installer's headline style, for the verdict at the end of `init`. */
export function headline(text: string): void {
  process.stdout.write(`${bold(text)}\n`);
}
