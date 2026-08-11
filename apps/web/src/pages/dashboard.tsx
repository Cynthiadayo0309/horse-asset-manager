import { useQuery } from '@tanstack/react-query';
import { formatYen } from '@horse-asset-manager/shared';
import { Bell, CalendarDays } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router';

import { ErrorState, LoadingState } from '@/components/feedback';
import { MetricCard, PageHeader, Panel } from '@/components/page';
import { apiRequest, currentDate, currentMonth } from '@/lib/api';
import type { AnalyticsRow, DashboardSummary, ScheduledCashflow } from '@/types';

export function DashboardPage() {
  const month = currentMonth();
  const start = `${month.slice(0, 4)}-01-01`;
  const end = `${month.slice(0, 4)}-12-31`;
  const summary = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => apiRequest<DashboardSummary>(`/api/dashboard/summary?targetMonth=${month}`),
  });
  const monthly = useQuery({
    queryKey: ['analytics', 'monthly', start, end],
    queryFn: () => apiRequest<AnalyticsRow[]>(`/api/analytics/monthly?from=${start}&to=${end}`),
  });
  const calendar = useQuery({
    queryKey: ['calendar', month],
    queryFn: () => apiRequest<ScheduledCashflow[]>(`/api/calendar?from=${currentDate()}&to=${end}`),
  });

  if (summary.isLoading) return <LoadingState />;
  if (summary.error || !summary.data) return <ErrorState error={summary.error} />;
  const data = summary.data;
  const chart = (monthly.data ?? []).map((row) => ({
    month: row.period?.slice(5) ?? '',
    expense: row.expenseYen,
    income: row.incomeYen,
  }));
  return (
    <div className="grid gap-6">
      <PageHeader
        title="ダッシュボード"
        description={`${month}のお金の状況と、これから必要になる支払いをまとめて確認できます。`}
        actions={
          <Link
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:w-auto"
            to="/cashflows"
          >
            収支を登録
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="今月の支出" value={data.actualExpenseYen} />
        <MetricCard label="今月の入金" value={data.incomeYen} tone="positive" />
        <MetricCard
          label="年内の予算残額"
          value={data.yearlyRemainingBudgetYen}
          tone={data.isOverBudget ? 'warning' : 'default'}
        />
        <MetricCard label="新しい出資に使える目安" value={data.availableInvestmentYen} />
      </div>
      {data.isOverBudget ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          年間予算を超える見込みです。予定支出と予算を確認してください。
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
        <Panel title="月別の確定収支">
          {monthly.isLoading ? (
            <LoadingState />
          ) : chart.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              確定した収支はまだありません。
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value: number) => `${Math.round(value / 10000)}万`} />
                <Tooltip formatter={(value) => formatYen(Number(value))} />
                <Bar dataKey="expense" name="支出" fill="#b7791f" radius={[4, 4, 0, 0]} />
                <Bar dataKey="income" name="入金" fill="#2f855a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="直近の支払い予定">
          <div className="grid gap-3">
            {(calendar.data ?? []).slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex min-w-0 items-center justify-between gap-3 border-b pb-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.title}</p>
                  <p className="text-muted-foreground">
                    <CalendarDays className="mr-1 inline size-3" />
                    {item.dueOn}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatYen(item.amountYen)}
                </span>
              </div>
            ))}
            {calendar.data?.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">予定はありません。</p>
            ) : null}
          </div>
        </Panel>
      </div>
      {data.unreadNotifications > 0 ? (
        <Link
          className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm"
          to="/notifications"
        >
          <Bell className="size-4 text-amber-600" />
          未読のお知らせが{data.unreadNotifications}件あります。
        </Link>
      ) : null}
    </div>
  );
}
