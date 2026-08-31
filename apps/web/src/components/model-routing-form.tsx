"use client";

import { useState, type FormEvent } from "react";
import type { ModelConnectionPublic } from "@pri/domain/model-settings";
import { modelSettingsErrorMessage } from "./model-test-result";
import { providerLabels } from "./model-connection-form";

export type ModelRoutingPublic = {
  classifyPrimaryId: string | null;
  classifyFallbackId: string | null;
  interpretPrimaryId: string | null;
  interpretFallbackId: string | null;
  updatedAt: string | null;
};
export type RoutingDraft = Omit<ModelRoutingPublic, "updatedAt">;

export function routingPayload(draft: RoutingDraft) {
  return Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value || null])) as RoutingDraft;
}

export function routingValidationError(
  draft: RoutingDraft,
  connections: ModelConnectionPublic[],
): string | null {
  const byId = new Map(connections.map((connection) => [connection.id, connection]));
  for (const [primaryId, fallbackId] of [
    [draft.classifyPrimaryId, draft.classifyFallbackId],
    [draft.interpretPrimaryId, draft.interpretFallbackId],
  ]) {
    if (fallbackId && !primaryId) return "设置备用连接前，请先选择主连接。";
    if (fallbackId && primaryId && byId.get(fallbackId)?.provider === byId.get(primaryId)?.provider) {
      return "主连接与备用连接必须使用不同供应商。";
    }
  }
  return null;
}

export function ModelRoutingForm({ connections, initial, disabled }: {
  connections: ModelConnectionPublic[];
  initial: ModelRoutingPublic;
  disabled: boolean;
}) {
  const initialDraft = stripTimestamp(initial);
  const [draft, setDraft] = useState<RoutingDraft>(initialDraft);
  const [saved, setSaved] = useState<RoutingDraft>(initialDraft);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    const validation = routingValidationError(draft, connections);
    if (validation) { setMessage(validation); return; }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/model-routing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(routingPayload(draft)),
      });
      const body = await response.json().catch(() => null) as { errorCode?: string; routing?: ModelRoutingPublic } | null;
      if (!response.ok) throw new Error(modelSettingsErrorMessage(body?.errorCode ?? "unknown"));
      const next = body?.routing ? stripTimestamp(body.routing) : routingPayload(draft);
      setDraft(next); setSaved(next); setMessage("任务路由已保存，将在下一批任务生效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally { setPending(false); }
  }

  function select(name: keyof RoutingDraft, label: string) {
    return <label>{label}<select value={draft[name] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [name]: event.target.value }))}><option value="">不启用</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name} · {providerLabels[connection.provider]}</option>)}</select></label>;
  }

  return (
    <form className="model-routing-form" onSubmit={save}>
      <div className="section-heading-row"><div><p className="section-kicker">Worker routing</p><h2>任务路由</h2></div><p className="section-note">同一任务的主备连接必须来自不同供应商</p></div>
      <fieldset disabled={disabled || pending || connections.length === 0}>
        <div className="model-form-grid">
          {select("classifyPrimaryId", "分类主连接")}{select("classifyFallbackId", "分类备用连接")}
          {select("interpretPrimaryId", "解读主连接")}{select("interpretFallbackId", "解读备用连接")}
        </div>
      </fieldset>
      <div className="model-form-actions">
        <button className="button-link" type="submit" disabled={disabled || connections.length === 0}>{pending ? "保存中…" : "保存任务路由"}</button>
        <button className="text-button" type="button" disabled={disabled} onClick={() => { setDraft(saved); setMessage(""); }}>取消更改</button>
      </div>
      <p className="form-status" aria-live="polite">{message}</p>
    </form>
  );
}

function stripTimestamp(routing: ModelRoutingPublic): RoutingDraft {
  return {
    classifyPrimaryId: routing.classifyPrimaryId ?? "",
    classifyFallbackId: routing.classifyFallbackId ?? "",
    interpretPrimaryId: routing.interpretPrimaryId ?? "",
    interpretFallbackId: routing.interpretFallbackId ?? "",
  };
}
