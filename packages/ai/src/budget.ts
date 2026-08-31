export type BudgetState = {
  spentMicroUsd: number;
  reservedMicroUsd: number;
  requestMicroUsd: number;
  budgetMicroUsd: number;
};

export function utcDayRange(now: Date): { from: Date; until: Date } {
  const from = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  return {
    from,
    until: new Date(from.getTime() + 24 * 60 * 60 * 1_000),
  };
}

export function canReserveBudget(input: BudgetState): boolean {
  const values = Object.values(input);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("AI budget values must be nonnegative safe integers");
  }
  const current = input.spentMicroUsd + input.reservedMicroUsd;
  return current < input.budgetMicroUsd &&
    current + input.requestMicroUsd <= input.budgetMicroUsd;
}

export function toBudgetMicroUsd(budgetUsd: number): number {
  const microUsd = Math.round(budgetUsd * 1_000_000);
  if (!Number.isSafeInteger(microUsd) || microUsd <= 0) {
    throw new Error("Daily AI budget must be a positive safe micro-USD value");
  }
  return microUsd;
}
