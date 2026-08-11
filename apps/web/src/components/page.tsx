import { formatYen } from '@horse-asset-manager/shared';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode | undefined;
}) {
  return (
    <header className="flex min-w-0 flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start sm:gap-6">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  children,
  className = '',
}: {
  title?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={`min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5 ${className}`}>
      {title ? <h2 className="mb-4 font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | null;
  tone?: 'default' | 'positive' | 'warning';
}) {
  return (
    <article
      className={`min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-5 ${tone === 'warning' ? 'border-amber-300 bg-amber-50' : ''}`}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl ${tone === 'positive' ? 'text-emerald-700' : ''}`}
      >
        {value == null ? '未設定' : formatYen(value)}
      </p>
    </article>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${colors[tone]}`}>
      {children}
    </span>
  );
}
