export function StatusPanel({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="status-panel" role="status">
      <p className="section-kicker">System status</p>
      <h2>{title}</h2>
      <p>{message}</p>
      {actionHref && actionLabel ? (
        <a className="button-link" href={actionHref}>
          {actionLabel}
        </a>
      ) : null}
    </section>
  );
}
