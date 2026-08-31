"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PaperDetailDto } from "@/presentation/paper";

type ReadingStatus = NonNullable<PaperDetailDto["userState"]>["status"];
type UserFeedback = NonNullable<PaperDetailDto["userState"]>["feedback"];

const ACTIONS: Array<{
  status: ReadingStatus;
  label: string;
}> = [
  { status: "SAVED", label: "稍后读" },
  { status: "READING", label: "正在阅读" },
  { status: "COMPLETE", label: "已完成" },
  { status: "SKIPPED", label: "不感兴趣" },
];

export function readingStatePayloadForAction(
  status: ReadingStatus,
  currentFeedback: UserFeedback,
): {
  status: ReadingStatus;
  feedback: UserFeedback;
} {
  if (status === "SKIPPED") {
    return { status, feedback: "DISLIKE" };
  }
  return {
    status,
    feedback: currentFeedback === "DISLIKE" ? "NONE" : currentFeedback,
  };
}

export function PaperStateControls({
  doi,
  currentStatus,
  currentFeedback,
}: {
  doi: string;
  currentStatus: ReadingStatus;
  currentFeedback: UserFeedback;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [feedback, setFeedback] = useState(currentFeedback);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateState(nextStatus: ReadingStatus) {
    setMessage("");
    startTransition(async () => {
      const payload = readingStatePayloadForAction(nextStatus, feedback);
      try {
        const response = await fetch(
          `/api/papers/${encodeURIComponent(doi)}/state`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) {
          throw new Error("state_update_failed");
        }
        setStatus(nextStatus);
        setFeedback(payload.feedback);
        setMessage("阅读状态已更新。推荐与队列已刷新。");
        router.refresh();
      } catch {
        setMessage("状态更新失败，请稍后重试。");
      }
    });
  }

  return (
    <section className="state-controls" aria-labelledby="reading-state-title">
      <div>
        <p className="section-kicker">Reading state</p>
        <h2 id="reading-state-title">阅读状态</h2>
      </div>
      <div className="state-button-row">
        {ACTIONS.map((action) => (
          <button
            aria-pressed={status === action.status}
            disabled={isPending}
            key={action.status}
            onClick={() => updateState(action.status)}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="state-message">
        {isPending ? "正在更新…" : message}
      </p>
    </section>
  );
}
