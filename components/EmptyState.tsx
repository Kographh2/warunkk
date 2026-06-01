export function EmptyState({ icon = 'bi-inbox', title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <div className="soft-card p-5 text-center">
      <i className={`bi ${icon} display-5 text-warunk`} />
      <h5 className="fw-bold mt-3 mb-1">{title}</h5>
      {subtitle && <p className="text-muted mb-0">{subtitle}</p>}
    </div>
  );
}
