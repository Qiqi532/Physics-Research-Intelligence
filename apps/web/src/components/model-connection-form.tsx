"use client";

import { useState, type FormEvent } from "react";
import { aiProviderNames, aiProviderPresets, type AiProviderName } from "@pri/domain/config";
import type { ModelConnectionPublic } from "@pri/domain/model-settings";
import { ModelTestResult, modelSettingsErrorMessage, type ModelTestState } from "./model-test-result";

export type ConnectionMode = "create" | "edit";
export type ConnectionDraft = {
  name: string;
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: string;
  inputCostPerMillionUsd: string;
  outputCostPerMillionUsd: string;
};

export const providerLabels: Record<AiProviderName, string> = {
  deepseek: "DeepSeek",
  openai: "OpenAI",
  gemini: "Google Gemini",
  qwen: "通义千问",
  glm: "智谱 GLM",
  kimi: "Kimi",
  hunyuan: "腾讯混元",
  compatible: "OpenAI 兼容接口",
};

export function connectionDraft(
  connection?: ModelConnectionPublic,
  copy = false,
): ConnectionDraft {
  if (!connection) {
    const preset = aiProviderPresets.kimi!;
    return {
      name: "",
      provider: "kimi",
      model: preset.model,
      apiKey: "",
      baseUrl: preset.baseUrl,
      requestTimeoutMs: "45000",
      inputCostPerMillionUsd: "10",
      outputCostPerMillionUsd: "50",
    };
  }
  return {
    name: `${connection.name}${copy ? " 副本" : ""}`,
    provider: connection.provider,
    model: connection.model,
    apiKey: "",
    baseUrl: connection.baseUrl,
    requestTimeoutMs: String(connection.requestTimeoutMs),
    inputCostPerMillionUsd: String(connection.inputCostPerMillionUsd),
    outputCostPerMillionUsd: String(connection.outputCostPerMillionUsd),
  };
}

export function applyProviderPreset(
  draft: ConnectionDraft,
  provider: AiProviderName,
): ConnectionDraft {
  const preset = aiProviderPresets[provider];
  return {
    ...draft,
    provider,
    ...(preset ? { model: preset.model, baseUrl: preset.baseUrl } : {}),
  };
}

export function connectionPayload(draft: ConnectionDraft, mode: ConnectionMode) {
  const payload = {
    name: draft.name.trim(),
    provider: draft.provider,
    model: draft.model.trim(),
    baseUrl: draft.baseUrl.trim(),
    requestTimeoutMs: Number(draft.requestTimeoutMs),
    inputCostPerMillionUsd: Number(draft.inputCostPerMillionUsd),
    outputCostPerMillionUsd: Number(draft.outputCostPerMillionUsd),
    ...(mode === "create" || draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
  };
  return payload;
}

type Props = {
  connection?: ModelConnectionPublic;
  mode: ConnectionMode;
  copy?: boolean;
  disabled: boolean;
  onSaved: (connection: ModelConnectionPublic) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
};

export function ModelConnectionForm(props: Props) {
  const [draft, setDraft] = useState(() => connectionDraft(props.connection, props.copy));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [testState, setTestState] = useState<ModelTestState>({ kind: "idle" });

  function field(name: keyof ConnectionDraft, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (props.disabled || pending) return;
    if (props.mode === "edit" && draft.apiKey.trim()
      && !window.confirm("确认更换此连接的 API Key？")) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        props.mode === "create" ? "/api/model-connections" : `/api/model-connections/${props.connection!.id}`,
        {
          method: props.mode === "create" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(connectionPayload(draft, props.mode)),
        },
      );
      const body = await readJson(response);
      if (!response.ok) throw new Error(modelSettingsErrorMessage(errorCode(body)));
      props.onSaved((body as { connection: ModelConnectionPublic }).connection);
      setDraft((current) => ({ ...current, apiKey: "" }));
      setMessage("已安全保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!props.connection || props.disabled || pending
      || !window.confirm(`确认删除“${props.connection.name}”？`)) return;
    setPending(true);
    try {
      const response = await fetch(`/api/model-connections/${props.connection.id}`, { method: "DELETE" });
      const body = await readJson(response);
      if (!response.ok) throw new Error(modelSettingsErrorMessage(errorCode(body)));
      props.onDeleted(props.connection.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function runTest(kind: "health" | "sample") {
    if (!props.connection || props.disabled || pending) return;
    if (kind === "sample" && !window.confirm("示例测试会调用模型并产生少量费用，是否继续？")) return;
    setTestState({ kind: "pending", label: kind === "health" ? "正在测试连接…" : "正在运行合成论文示例…" });
    try {
      const response = await fetch(`/api/model-connections/${props.connection.id}/${kind}`, { method: "POST" });
      const body = await readJson(response);
      if (!response.ok) throw new Error(modelSettingsErrorMessage(errorCode(body)));
      setTestState({ kind: "success", label: kind === "health" ? "连接测试成功" : "示例分类与解读完成", result: (body as { result: unknown }).result });
    } catch (error) {
      setTestState({ kind: "error", message: error instanceof Error ? error.message : "操作失败，请稍后重试。" });
    }
  }

  const legend = props.mode === "create" ? (props.copy ? "复制模型连接" : "新建模型连接") : "编辑模型连接";
  return (
    <form className="model-connection-form" onSubmit={save}>
      <fieldset disabled={props.disabled || pending}>
        <legend>{legend}</legend>
        <div className="model-form-grid">
          <label>配置名称<input required maxLength={64} value={draft.name} onChange={(event) => field("name", event.target.value)} /></label>
          <label>供应商<select value={draft.provider} onChange={(event) => setDraft((current) => applyProviderPreset(current, event.target.value as AiProviderName))}>{aiProviderNames.map((provider) => <option key={provider} value={provider}>{providerLabels[provider]}</option>)}</select></label>
          <label>模型名称<input required maxLength={128} value={draft.model} onChange={(event) => field("model", event.target.value)} /></label>
          <label>API Key<input required={props.mode === "create"} type="password" autoComplete="new-password" value={draft.apiKey} placeholder={props.mode === "edit" ? "留空则保留现有密钥" : "仅在保存时发送"} onChange={(event) => field("apiKey", event.target.value)} /></label>
          <label className="model-field-wide">接口地址<input required type="url" value={draft.baseUrl} onChange={(event) => field("baseUrl", event.target.value)} /></label>
          <label>超时（毫秒）<input required type="number" min="1000" max="120000" step="1000" value={draft.requestTimeoutMs} onChange={(event) => field("requestTimeoutMs", event.target.value)} /></label>
          <label>输入价（美元/百万 token）<input required type="number" min="0" step="0.0001" value={draft.inputCostPerMillionUsd} onChange={(event) => field("inputCostPerMillionUsd", event.target.value)} /></label>
          <label>输出价（美元/百万 token）<input required type="number" min="0" step="0.0001" value={draft.outputCostPerMillionUsd} onChange={(event) => field("outputCostPerMillionUsd", event.target.value)} /></label>
        </div>
      </fieldset>
      <p className="model-secret-note">API Key 加密保存，页面不会再次显示明文。价格用于预算估算，请按供应商账单填写。</p>
      <div className="model-form-actions">
        <button className="button-link" type="submit">{pending ? "保存中…" : "保存配置"}</button>
        <button className="text-button" type="button" onClick={props.onCancel}>取消更改</button>
        {props.mode === "edit" ? <button className="text-button danger-button" type="button" onClick={remove}>删除</button> : null}
      </div>
      <p className="form-status" aria-live="polite">{message}</p>
      {props.mode === "edit" ? (
        <section className="model-test-panel" aria-labelledby="connection-test-title">
          <div><p className="section-kicker">Safe checks</p><h3 id="connection-test-title">连接测试</h3></div>
          <div className="model-form-actions">
            <button className="text-button" type="button" disabled={props.disabled} onClick={() => runTest("health")}>轻量连通测试</button>
            <button className="text-button" type="button" disabled={props.disabled} onClick={() => runTest("sample")}>合成论文示例</button>
          </div>
          <p className="model-secret-note">示例只使用项目内置的合成标题与摘要，不读取论文或写入业务数据。</p>
          <ModelTestResult state={testState} />
        </section>
      ) : null}
    </form>
  );
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  try { return await response.json(); } catch { return null; }
}

function errorCode(body: unknown): string {
  return typeof body === "object" && body !== null && "errorCode" in body
    && typeof body.errorCode === "string" ? body.errorCode : "unknown";
}
