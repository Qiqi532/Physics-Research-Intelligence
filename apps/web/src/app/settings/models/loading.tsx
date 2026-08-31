import { ModelSettingsPageView } from "@/components/model-settings-page-view";

export default function LoadingModelSettings() {
  return <main className="settings-shell model-settings-shell"><ModelSettingsPageView state={{ kind: "loading" }} /></main>;
}
