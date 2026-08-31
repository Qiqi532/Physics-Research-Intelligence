import { InterestSettingsPageView } from "@/components/interest-settings-page-view";

export default function InterestSettingsLoading() {
  return <main className="settings-shell"><InterestSettingsPageView state={{ kind: "loading" }} /></main>;
}
