import type { InterestTag } from "@pri/db";
import { InterestSettingsForm } from "./interest-settings-form";
import { StatusPanel } from "./status-panel";

type InterestSettingsViewState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; tags: InterestTag[] };

export function InterestSettingsPageView({ state }: { state: InterestSettingsViewState }) {
  if (state.kind === "loading") {
    return <StatusPanel title="正在加载兴趣方向" message="读取现有物理标签与权重。" />;
  }
  if (state.kind === "error") {
    return <StatusPanel title="兴趣设置暂时不可用" message="现有推荐仍可使用，请稍后重试。" />;
  }
  if (state.tags.length === 0) {
    return <StatusPanel title="还没有可设置的物理方向" message="标签同步完成后即可设置兴趣。" />;
  }
  return <InterestSettingsForm tags={state.tags} />;
}
