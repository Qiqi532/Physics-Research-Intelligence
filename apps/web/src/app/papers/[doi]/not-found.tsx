import { StatusPanel } from "@/components/status-panel";

export default function PaperNotFound() {
  return (
    <main className="centered-status">
      <StatusPanel
        actionHref="/"
        actionLabel="返回 Today Physics"
        title="没有找到这篇论文"
        message="DOI 可能尚未收录，或链接已经失效。"
      />
    </main>
  );
}
