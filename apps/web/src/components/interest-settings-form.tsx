"use client";

import type { InterestTag } from "@pri/db";
import { useState } from "react";
import { useRouter } from "next/navigation";

type InterestDraft = Record<string, number>;
type SaveStatus = "idle" | "saving" | "success" | "error";

export function currentInterestDraft(tags: InterestTag[]): InterestDraft {
  return Object.fromEntries(tags.map(({ slug, weight }) => [slug, weight]));
}

export function defaultInterestDraft(tags: InterestTag[]): InterestDraft {
  return Object.fromEntries(tags.map(({ slug, defaultWeight }) => [slug, defaultWeight]));
}

export function interestPayloadForSave(draft: InterestDraft) {
  return {
    interests: Object.entries(draft)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([tagSlug, weight]) => ({ tagSlug, weight })),
  };
}

export function InterestSettingsForm({ tags }: { tags: InterestTag[] }) {
  const router = useRouter();
  const [visibleTags, setVisibleTags] = useState(tags);
  const [savedDraft, setSavedDraft] = useState(() => currentInterestDraft(tags));
  const [draft, setDraft] = useState(() => currentInterestDraft(tags));
  const [status, setStatus] = useState<SaveStatus>("idle");

  const updateWeight = (slug: string, weight: number) => {
    setDraft((current) => ({ ...current, [slug]: weight }));
    setStatus("idle");
  };

  const save = async () => {
    setStatus("saving");
    try {
      const response = await fetch("/api/interests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(interestPayloadForSave(draft)),
      });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const body = await response.json() as { tags: InterestTag[] };
      const nextDraft = currentInterestDraft(body.tags);
      setVisibleTags(body.tags);
      setSavedDraft(nextDraft);
      setDraft(nextDraft);
      setStatus("success");
      router.refresh();
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="interest-settings-card">
      <div className="interest-list">
        {visibleTags.map((tag) => (
          <section className="interest-row" key={tag.slug}>
            <div className="interest-label">
              <div>
                <strong>{tag.labelZh}</strong>
                <span>{tag.labelEn}</span>
              </div>
              {tag.isCrossDisciplinary ? <em>交叉方向</em> : null}
            </div>
            <div className="interest-control">
              <label htmlFor={`interest-${tag.slug}`}>{tag.labelZh}兴趣权重</label>
              <input
                aria-label={`${tag.labelZh}兴趣权重`}
                id={`interest-${tag.slug}`}
                max="2"
                min="0"
                onChange={(event) => updateWeight(tag.slug, Number(event.target.value))}
                step="0.25"
                type="range"
                value={draft[tag.slug] ?? 0}
              />
              <output htmlFor={`interest-${tag.slug}`}>{(draft[tag.slug] ?? 0).toFixed(2)}</output>
              <button
                className="text-button"
                onClick={() => updateWeight(tag.slug, 0)}
                type="button"
              >
                取消此兴趣
              </button>
            </div>
          </section>
        ))}
      </div>
      <div className="interest-actions">
        <button disabled={status === "saving"} onClick={save} type="button">
          {status === "saving" ? "保存中…" : "保存兴趣"}
        </button>
        <button
          className="secondary-button"
          disabled={status === "saving"}
          onClick={() => {
            setDraft(savedDraft);
            setStatus("idle");
          }}
          type="button"
        >
          取消修改
        </button>
        <button
          className="secondary-button"
          disabled={status === "saving"}
          onClick={() => {
            setDraft(defaultInterestDraft(visibleTags));
            setStatus("idle");
          }}
          type="button"
        >
          恢复默认值
        </button>
      </div>
      <p aria-live="polite" className="form-status" role="status">
        {status === "success" ? "兴趣已保存，Today Physics 推荐已刷新。" : null}
        {status === "error" ? "保存失败，请稍后重试；现有兴趣未被覆盖。" : null}
        {status === "saving" ? "正在保存兴趣设置。" : null}
      </p>
    </div>
  );
}
