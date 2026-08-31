export function modelSettingsErrorMessage(errorCode: string): string {
  const messages: Record<string, string> = {
    authentication: "API Key 无效或无权访问所选模型。",
    rate_limited: "供应商正在限流，请稍后重试。",
    timeout: "连接测试超时，请检查地址或稍后重试。",
    network_error: "无法连接供应商，请检查网络和接口地址。",
    upstream_5xx: "供应商服务暂时不可用。",
    settings_invalid: "配置内容无效，请检查必填项和数值。",
    settings_api_key_required: "更换供应商时必须重新填写 API Key。",
    settings_connection_limit: "模型连接数量已达到上限。",
    settings_test_in_progress: "该连接已有测试正在运行。",
    settings_test_cooldown: "测试过于频繁，请稍后再试。",
    settings_secret_unavailable: "密钥存储暂时不可用。",
    settings_master_key_invalid: "密钥存储暂时不可用。",
    settings_master_key_unavailable: "密钥存储暂时不可用。",
    secret_key_unavailable: "密钥存储暂时不可用，请检查本机主密钥文件。",
    secret_decryption_failed: "现有密钥无法解密，请在本机重新填写此连接的 API Key。",
    settings_fallback_must_differ: "主连接和备用连接必须来自不同供应商。",
    profile_in_use: "该连接正在任务路由中使用，请先调整路由。",
    profile_not_found: "模型连接不存在或已被删除。",
    settings_lan_read_only: "局域网访问为只读，请回到运行服务的电脑操作。",
    settings_origin_invalid: "请求来源验证失败，请刷新页面后重试。",
    settings_unavailable: "模型设置暂时不可用。",
  };
  return messages[errorCode] ?? "操作失败，请稍后重试。";
}

export type ModelTestState =
  | { kind: "idle" }
  | { kind: "pending"; label: string }
  | { kind: "error"; message: string }
  | { kind: "success"; label: string; result: unknown };

export function ModelTestResult({ state }: { state: ModelTestState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "pending") {
    return <p className="model-test-result" role="status">{state.label}</p>;
  }
  if (state.kind === "error") {
    return <p className="model-test-result model-test-error" role="alert">{state.message}</p>;
  }
  return (
    <div className="model-test-result model-test-success" role="status">
      <strong>{state.label}</strong>
      <details>
        <summary>查看安全测试结果</summary>
        <pre>{JSON.stringify(state.result, null, 2)}</pre>
      </details>
    </div>
  );
}
