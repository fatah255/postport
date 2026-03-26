import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const rootEnvPath = resolve(process.cwd(), ".env");
const targets = [
  resolve(process.cwd(), "apps/api/.env"),
  resolve(process.cwd(), "apps/worker/.env"),
  resolve(process.cwd(), "apps/web/.env.local")
];

const envContents = readFileSync(rootEnvPath, "utf8");

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, envContents, "utf8");
}

console.log(`Synced .env -> ${targets.length} app env files`);
