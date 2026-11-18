"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaperStatePatch, RankingFeedback } from "@pri/domain/ranking-review";

export async function updatePaperState(paperId: string, patch: PaperStatePatch) {
  const response = await fetch(`/api/paper-state/${encodeURIComponent(paperId)}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error("state_update_failed");
}

export function PaperFeedbackButtons({ paperId, feedback }: { paperId: string; feedback: RankingFeedback }) {
  const router = useRouter();
  const [selected, setSelected] = useOptimistic(feedback);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  function choose(next: "LIKE" | "DISLIKE") {
    setFailed(false);
    startTransition(async () => {
      const value = selected === next ? "NONE" : next;
      setSelected(value);
      try {
        await updatePaperState(paperId, { feedback: value });
        router.refresh();
      } catch { setFailed(true); }
    });
  }
  return <div className="state-button-row feedback-buttons" role="group" aria-label="课题反馈">
    <button type="button" disabled={pending} aria-pressed={selected === "LIKE"} onClick={() => choose("LIKE")}>值得精读</button>
    <button type="button" disabled={pending} aria-pressed={selected === "DISLIKE"} onClick={() => choose("DISLIKE")}>与课题无关</button>
    {failed && <span role="status">反馈保存失败，请稍后重试。</span>}
  </div>;
}
