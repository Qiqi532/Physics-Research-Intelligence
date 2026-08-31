import { toLogSafeData } from "@pri/domain/config";

export type LogEvent = {
  event: string;
  status: "ready" | "running" | "complete" | "failed" | "skipped";
  errorCode?: string;
  details?: Record<string, unknown>;
};

type StructuredLogger = (input: LogEvent) => void;

export function createStructuredLogger(
  sink: (event: Record<string, unknown>) => void = console.info,
  now: () => Date = () => new Date(),
) {
  return (input: LogEvent): void => {
    sink({
      event: input.event,
      status: input.status,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      timestamp: now().toISOString(),
      ...(input.details ? { details: toLogSafeData(input.details) } : {}),
    });
  };
}

export async function runLoggedOperation<T>(input: {
  event: string;
  errorCode: string;
  logger: StructuredLogger;
  operation(): Promise<T>;
}): Promise<T> {
  input.logger({ event: input.event, status: "running" });
  try {
    const result = await input.operation();
    input.logger({
      event: input.event,
      status: "complete",
      details: { result },
    });
    return result;
  } catch (error) {
    input.logger({
      event: input.event,
      status: "failed",
      errorCode: input.errorCode,
      details: { error },
    });
    throw error;
  }
}
