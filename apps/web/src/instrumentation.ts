import { parseConfig, toLogSafeData } from "@pri/domain/config";

export function register() {
  try {
    parseConfig(process.env);
  } catch (error) {
    console.error("Web configuration error", toLogSafeData(error));
    throw error;
  }
}
