import { describe, expect, it } from "vitest";
import {
  estimateCost,
  estimateMaximumCost,
} from "../../packages/ai/src/cost";

const prices = {
  inputCostPerMillionUsd: 2,
  outputCostPerMillionUsd: 4,
};

describe("AI cost estimation", () => {
  it("calculates integer micro-USD from provider token usage", () => {
    expect(estimateCost({
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      prices,
    })).toEqual({
      microUsd: 400,
      usd: 0.0004,
    });
  });

  it("rounds fractional micro-USD to the nearest integer", () => {
    expect(estimateCost({
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      prices: {
        inputCostPerMillionUsd: 0.25,
        outputCostPerMillionUsd: 0.75,
      },
    })).toEqual({ microUsd: 2, usd: 0.000002 });
  });

  it("estimates a reservation from prompt length and maximum output", () => {
    expect(estimateMaximumCost({
      promptCharacters: 400,
      maxOutputTokens: 50,
      prices,
    })).toEqual({
      estimatedInputTokens: 100,
      microUsd: 400,
      usd: 0.0004,
    });
  });
});
