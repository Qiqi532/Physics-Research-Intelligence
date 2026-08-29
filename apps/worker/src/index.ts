import "dotenv/config";
import { parseConfig, toLogSafeData } from "@pri/domain/config";

try {
  const config = parseConfig(process.env);
  console.info("Worker configuration loaded", toLogSafeData({
    databaseConfigured: config.DATABASE_URL.length > 0,
    redisConfigured: config.REDIS_URL.length > 0,
    dailyBudgetUsd: config.DAILY_AI_BUDGET_USD,
  }));
} catch (error) {
  console.error("Worker configuration error", toLogSafeData(error));
  process.exitCode = 1;
}
