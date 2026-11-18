"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PaperDetailDto } from "@/presentation/paper";
import { PaperFeedbackButtons, updatePaperState } from "./paper-feedback-buttons";

type ReadingStatus = NonNullable<PaperDetailDto["userState"]>["status"];
type UserFeedback = NonNullable<PaperDetailDto["userState"]>["feedback"];

const ACTIONS: Array<{
  status: ReadingStatus;
  label: string;
}> = [
  { status: "SAVED", label: "稍后读" },
  { status: "READING", label: "正在阅读" },
  { status: "COMPLETE", label: "已完成" },
  { status: "SKIPPED", label: "跳过阅读" },
];

export function PaperStateControls({
  paperId,
  currentStatus,
  currentFeedback,
  currentFavorite,
}: {
  paperId: string;
  currentStatus: ReadingStatus;
  currentFeedback: UserFeedback;
  currentFavorite: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [favorite, setFavorite] = useState(currentFavorite);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateState(nextStatus: ReadingStatus) {
    setMessage("");
    startTransition(async () => {
      try {
        await updatePaperState(paperId, { status: nextStatus });
        setStatus(nextStatus);
        setMessage("阅读状态已更新。");
        router.refresh();
      } catch {
        setMessage("状态更新失败，请稍后重试。");
      }
    });
  }

  function toggleFavorite() {
    setMessage("");
    startTransition(async () => {
      try {
        const nextFavorite = !favorite;
        await updatePaperState(paperId, { isFavorite: nextFavorite });
        setFavorite(nextFavorite);
        setMessage(nextFavorite ? "已加入收藏。" : "已取消收藏。");
        router.refresh();
      } catch {
        setMessage("收藏更新失败，请稍后重试。");
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
        <button
          aria-pressed={favorite}
          className={favorite ? "favorite-button favorite-button-active" : "favorite-button"}
          disabled={isPending}
          onClick={toggleFavorite}
          type="button"
        >
          {favorite ? "已收藏" : "收藏"}
        </button>
      </div>
      <PaperFeedbackButtons paperId={paperId} feedback={currentFeedback} />
      <p aria-live="polite" className="state-message">
        {isPending ? "正在更新…" : message}
      </p>
    </section>
  );
}
