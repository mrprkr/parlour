const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const min = order[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 1;

function write(level: Level, scope: string, args: unknown[]): void {
  if (order[level] < min) return;
  const stream = level === "error" || level === "warn" ? console.error : console.log;
  stream(`${stamp()} ${level.padEnd(5)} ${scope.padEnd(10)}`, ...args);
}

export function logger(scope: string) {
  return {
    debug: (...a: unknown[]) => write("debug", scope, a),
    info: (...a: unknown[]) => write("info", scope, a),
    warn: (...a: unknown[]) => write("warn", scope, a),
    error: (...a: unknown[]) => write("error", scope, a),
  };
}
