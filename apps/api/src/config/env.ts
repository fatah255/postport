import "dotenv/config";
import { parseApiEnv } from "@postport/config";

export const env = parseApiEnv(process.env);
