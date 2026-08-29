import { describe, expect, it } from "vitest";
import {
  canReserveBudget,
  toBudgetMicroUsd,
  utcDayRange,
} from "../../packages/ai/src/budget";

describe("daily AI budget", () => {
  it("uses a half-open UTC day at local-time-independent boundaries", () => {
    expect(utcDayRange(new Date("2026-08-29T23:59:59.999Z"))).toEqual({
      from: new Date("2026-08-29T00:00:00.000Z"),
      until: new Date("2026-08-30T00:00:00.000Z"),
    });
  });

  it.each([
    {
      name: "allows a reservation below budget",
      input: { spentMicroUsd: 400, reservedMicroUsd: 100, requestMicroUsd: 499, budgetMicroUsd: 1_000 },
      expected: true,
    },
    {
      name: "allows reaching the budget exactly",
      input: { spentMicroUsd: 400, reservedMicroUsd: 100, requestMicroUsd: 500, budgetMicroUsd: 1_000 },
      expected: true,
    },
    {
      name: "blocks a new request when already at budget",
      input: { spentMicroUsd: 900, reservedMicroUsd: 100, requestMicroUsd: 1, budgetMicroUsd: 1_000 },
      expected: false,
    },
    {
      name: "blocks a request that would exceed budget",
      input: { spentMicroUsd: 900, reservedMicroUsd: 0, requestMicroUsd: 101, budgetMicroUsd: 1_000 },
      expected: false,
    },
  ])("$name", ({ input, expected }) => {
    expect(canReserveBudget(input)).toBe(expected);
  });

  it("converts configured USD to integer micro-USD", () => {
    expect(toBudgetMicroUsd(2.5)).toBe(2_500_000);
  });
});
