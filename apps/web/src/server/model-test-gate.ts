export type ModelTestKind = "health" | "sample";

export type ModelTestGateResult<T> =
  | { accepted: true; value: T }
  | { accepted: false; reason: "busy" }
  | { accepted: false; reason: "cooldown"; retryAfterMs: number };

export interface ModelTestGate {
  execute<T>(
    profileId: string,
    kind: ModelTestKind,
    operation: () => Promise<T>,
  ): Promise<ModelTestGateResult<T>>;
}

const cooldownMs: Record<ModelTestKind, number> = {
  health: 5_000,
  sample: 60_000,
};

export function createModelTestGate(options: {
  now?: () => number;
} = {}): ModelTestGate {
  const now = options.now ?? Date.now;
  const states = new Map<string, {
    running: boolean;
    completedAt: Partial<Record<ModelTestKind, number>>;
  }>();

  return {
    async execute(profileId, kind, operation) {
      const state = states.get(profileId) ?? { running: false, completedAt: {} };
      states.set(profileId, state);
      if (state.running) {
        return { accepted: false, reason: "busy" };
      }
      const lastCompletedAt = state.completedAt[kind];
      if (lastCompletedAt !== undefined) {
        const retryAfterMs = cooldownMs[kind] - (now() - lastCompletedAt);
        if (retryAfterMs > 0) {
          return { accepted: false, reason: "cooldown", retryAfterMs };
        }
      }
      state.running = true;
      try {
        return { accepted: true, value: await operation() };
      } finally {
        state.running = false;
        state.completedAt[kind] = now();
      }
    },
  };
}
