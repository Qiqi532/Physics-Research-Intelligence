import type { AiUsage } from "./provider";

export type AiPrices = {
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
};

export type CostEstimate = {
  microUsd: number;
  usd: number;
};

export function estimateCost(input: {
  usage: AiUsage;
  prices: AiPrices;
}): CostEstimate {
  return toCostEstimate(
    input.usage.inputTokens * input.prices.inputCostPerMillionUsd +
      input.usage.outputTokens * input.prices.outputCostPerMillionUsd,
  );
}

export function estimateMaximumCost(input: {
  promptCharacters: number;
  maxOutputTokens: number;
  prices: AiPrices;
}): CostEstimate & { estimatedInputTokens: number } {
  const estimatedInputTokens = Math.ceil(input.promptCharacters / 4);
  return {
    estimatedInputTokens,
    ...toCostEstimate(
      estimatedInputTokens * input.prices.inputCostPerMillionUsd +
        input.maxOutputTokens * input.prices.outputCostPerMillionUsd,
    ),
  };
}

function toCostEstimate(rawMicroUsd: number): CostEstimate {
  if (!Number.isFinite(rawMicroUsd) || rawMicroUsd < 0) {
    throw new Error("AI cost estimate must be finite and nonnegative");
  }
  const microUsd = Math.round(rawMicroUsd);
  if (!Number.isSafeInteger(microUsd)) {
    throw new Error("AI cost estimate exceeds the safe integer range");
  }
  return {
    microUsd,
    usd: microUsd / 1_000_000,
  };
}
