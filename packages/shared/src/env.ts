import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

function parseEnvFile(content: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    if (!key || key in process.env) continue;

    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    process.env[key] = value;
  }
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return false;
  parseEnvFile(readFileSync(filePath, "utf8"));
  return true;
}

export function ensureRootEnvLoaded() {
  if (loaded) return;
  loaded = true;

  let current = process.cwd();
  while (true) {
    const envPath = resolve(current, ".env");
    const envLocalPath = resolve(current, ".env.local");
    let loadedAny = false;
    loadedAny = loadEnvFile(envPath) || loadedAny;
    loadedAny = loadEnvFile(envLocalPath) || loadedAny;
    if (loadedAny) {
      return;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return;
    }
    current = parent;
  }
}
