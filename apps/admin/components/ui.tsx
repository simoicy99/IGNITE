import React from 'react';

// ─── Badge ──────────────────────────────────────────────────────────────────
interface BadgeProps {
  status?: string;
  variant?: string;
  children?: React.ReactNode;
}
export function Badge({ status, variant, children }: BadgeProps) {
  const value = (status || variant || 'neutral').toString();
  const cls = `badge badge-${value.toLowerCase().replace(/\s+/g, '_')}`;
  return <span className={cls}>{children || value.replace(/_/g, ' ')}</span>;
}

// ─── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}
export function Button({ variant = 'secondary', size, loading, children, className = '', ...props }: ButtonProps) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  return (
    <button className={`btn btn-${variant} ${sizeClass} ${className}`.trim()} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : null}
      {children}
    </button>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
interface CardProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}
export function Card({ title, actions, children, className = '' }: CardProps) {
  return (
    <div className={`card ${className}`.trim()}>
      {(title || actions) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number | string;
  icon?: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
}
export function StatCard({ label, value, icon, change, changeType = 'neutral' }: StatCardProps) {
  const changeClass = changeType === 'positive' ? 'text-success' : changeType === 'negative' ? 'text-danger' : 'text-muted';
  return (
    <div className="stat-card">
      {icon && <div className="stat-icon">{icon}</div>}
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {change && <div className={`stat-change ${changeClass}`}>{change}</div>}
    </div>
  );
}

// ─── Loading ─────────────────────────────────────────────────────────────────
export function Loading({ text }: { text?: string }) {
  return (
    <div className="loading" style={{ flexDirection: 'column', gap: 14 }}>
      <div className="spinner" />
      {text && <p className="text-muted" style={{ fontSize: 13 }}>{text}</p>}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}
export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}

// ─── DataTable ────────────────────────────────────────────────────────────────
interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}
interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  keyField?: string;
}
export function DataTable<T extends Record<string, any>>({
  columns, data, loading, emptyMessage = 'No data', keyField = 'id'
}: DataTableProps<T>) {
  if (loading) return <Loading />;
  if (!data.length) return <EmptyState title={emptyMessage} />;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            {columns.map(c => <th key={c.key}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row[keyField] || i}>
              {columns.map(c => (
                <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
