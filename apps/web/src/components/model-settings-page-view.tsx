import type { ModelConnectionPublic } from "@pri/domain/model-settings";
import { ModelSettingsConsole } from "./model-settings-console";
import type { ModelRoutingPublic } from "./model-routing-form";
import { StatusPanel } from "./status-panel";

export type ModelSettingsPageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "secret_error" }
  | { kind: "ready"; connections: ModelConnectionPublic[]; routing: ModelRoutingPublic; managementEnabled: boolean };

export function ModelSettingsPageView({ state }: { state: ModelSettingsPageState }) {
  if (state.kind === "loading") return <StatusPanel title="正在加载模型连接" message="读取公开配置元数据和任务路由。" />;
  if (state.kind === "error") return <StatusPanel title="模型设置暂时不可用" message="Today Physics 仍可使用，请检查数据库后重试。" />;
  if (state.kind === "secret_error") return <StatusPanel title="密钥存储暂时不可用" message="未读取或显示任何 API Key，请检查本机密钥文件。" />;
  return <>{!state.managementEnabled ? <div className="status-panel status-warning" role="status"><p className="section-kicker">局域网只读</p><h2>请回到运行服务的电脑操作</h2><p>手机或其他电脑可以查看连接状态，但不能保存配置或运行付费测试。</p></div> : null}<ModelSettingsConsole initialConnections={state.connections} routing={state.routing} managementEnabled={state.managementEnabled} /></>;
}
