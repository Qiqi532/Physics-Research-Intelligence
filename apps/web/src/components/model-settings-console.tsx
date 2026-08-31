"use client";

import { useMemo, useState } from "react";
import type { ModelConnectionPublic } from "@pri/domain/model-settings";
import { ModelConnectionForm, providerLabels, type ConnectionMode } from "./model-connection-form";
import { ModelRoutingForm, type ModelRoutingPublic } from "./model-routing-form";

type EditorState = { mode: ConnectionMode; connection?: ModelConnectionPublic; copy?: boolean };

export function ModelSettingsConsole({ initialConnections, routing, managementEnabled }: {
  initialConnections: ModelConnectionPublic[];
  routing: ModelRoutingPublic;
  managementEnabled: boolean;
}) {
  const [connections, setConnections] = useState(initialConnections);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState>(() => initialConnections[0]
    ? { mode: "edit", connection: initialConnections[0] }
    : { mode: "create" });
  const visible = useMemo(() => connections.filter((connection) =>
    `${connection.name} ${connection.model} ${providerLabels[connection.provider]}`
      .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [connections, query]);

  function saved(connection: ModelConnectionPublic) {
    setConnections((current) => [...current.filter((item) => item.id !== connection.id), connection]
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN")));
    setEditor({ mode: "edit", connection });
  }
  function removed(id: string) {
    const next = connections.filter((connection) => connection.id !== id);
    setConnections(next);
    setEditor(next[0] ? { mode: "edit", connection: next[0] } : { mode: "create" });
  }
  function cancel() {
    const selected = editor.connection && connections.find((item) => item.id === editor.connection!.id);
    setEditor(selected ? { mode: "edit", connection: selected } : connections[0]
      ? { mode: "edit", connection: connections[0] }
      : { mode: "create" });
  }

  return (
    <div className="model-settings-console">
      <div className="model-settings-grid">
        <aside className="model-profile-panel" aria-labelledby="model-profile-title">
          <div className="model-panel-heading">
            <div><p className="section-kicker">Named profiles</p><h2 id="model-profile-title">模型连接</h2></div>
            <button className="text-button" type="button" disabled={!managementEnabled} onClick={() => setEditor({ mode: "create" })}>新建</button>
          </div>
          <label className="model-search">筛选连接<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          {connections.length === 0 ? <div className="model-empty"><strong>还没有模型连接</strong><p>新建一个命名配置，只需填写 API Key 即可使用官方预设。</p></div> : null}
          <ul className="model-profile-list">
            {visible.map((connection) => (
              <li key={connection.id}><button type="button" aria-pressed={editor.mode === "edit" && editor.connection?.id === connection.id} onClick={() => setEditor({ mode: "edit", connection })}>
                <span><strong>{connection.name}</strong><small>{providerLabels[connection.provider]} · {connection.model}</small></span><em>已安全保存</em>
              </button></li>
            ))}
          </ul>
          {editor.connection ? <button className="text-button model-copy-button" type="button" disabled={!managementEnabled} onClick={() => setEditor({ mode: "create", connection: editor.connection, copy: true })}>复制当前配置</button> : null}
        </aside>
        <section className="model-editor-panel" aria-label="模型连接编辑器">
          <ModelConnectionForm key={`${editor.mode}-${editor.connection?.id ?? "new"}-${editor.copy ? "copy" : "original"}`} connection={editor.connection} mode={editor.mode} copy={editor.copy} disabled={!managementEnabled} onSaved={saved} onDeleted={removed} onCancel={cancel} />
        </section>
      </div>
      <ModelRoutingForm connections={connections} initial={routing} disabled={!managementEnabled} />
    </div>
  );
}
