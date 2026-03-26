import "dotenv/config";
import { parseWorkerEnv } from "@postport/config";

export const env = parseWorkerEnv(process.env);
