type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  const payload = {
    level,
    message,
    meta,
    timestamp: new Date().toISOString()
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
