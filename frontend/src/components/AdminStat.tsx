import { Icon, IconName } from "./Icons";

/** Metric card used across the admin area (dashboard, pricing, statistics, data quality). */
export function AdminStat({ icon, tone, label, value, note }: { icon: IconName; tone: string; label: string; value: string | number; note?: string }) {
  return (
    <article className="admin-metric-card ad-stat">
      <span className={`ad-stat-icon ${tone}`}><Icon name={icon} /></span>
      <span className="ad-stat-label">{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}
