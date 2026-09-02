import "dotenv/config";
import { createConfiguredDailyProcessor } from "./configured-daily-processor.js";
import { parseConfig } from "@pri/domain/config";

async function main() {
  const startedAt = new Date();
  console.log(`[manual-daily] starting at ${startedAt.toISOString()}`);
  console.log(
    `[manual-daily] AI_SETTINGS_MASTER_KEY_FILE_CONFIGURED=${Boolean(process.env.AI_SETTINGS_MASTER_KEY_FILE)}`,
  );

  const config = parseConfig(process.env);
  console.log(`[manual-daily] DAILY_PIPELINE_ENABLED=${config.DAILY_PIPELINE.enabled}`);
  console.log(`[manual-daily] DAILY_PAPER_TARGET=${config.DAILY_PAPER_TARGET_MIN}-${config.DAILY_PAPER_TARGET_MAX}`);

  const processor = createConfiguredDailyProcessor(config);

  try {
    const result = await processor.process();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    console.log(`[manual-daily] completed in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[manual-daily] windowKey=${result.windowKey}`);
    console.log(`[manual-daily] ingestedRecords=${result.ingestedRecords}`);
    console.log(`[manual-daily] screening=${JSON.stringify(result.screening)}`);
    console.log(`[manual-daily] interpretation=${JSON.stringify(result.interpretation)}`);
    console.log(`[manual-daily] recommendations=${result.recommendations}`);
    console.log(`[manual-daily] cleanup=${JSON.stringify(result.cleanup)}`);
  } catch (error) {
    console.error("[manual-daily] FAILED:", error);
    process.exitCode = 1;
  } finally {
    await processor.close();
  }
}

main();
