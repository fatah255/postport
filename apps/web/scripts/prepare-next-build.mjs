import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const nextDir = join(process.cwd(), ".next");
const typesDir = join(nextDir, "types");
const routesFile = join(typesDir, "routes.d.ts");
const tsBuildInfoFile = join(process.cwd(), "tsconfig.tsbuildinfo");

await rm(nextDir, { recursive: true, force: true });
await rm(tsBuildInfoFile, { force: true });
await mkdir(typesDir, { recursive: true });
await writeFile(routesFile, "export {};\n", "utf8");
